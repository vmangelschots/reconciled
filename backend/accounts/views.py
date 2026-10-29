from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from budgets.models import Category
from budgets.tabs import check_assignable
from transactions import loans
from transactions.adjustments import AdjustmentError, set_value
from transactions.models import Transaction
from transactions.serializers import TransactionSerializer

from .models import Account, Loan, tier_position
from .serializers import AccountSerializer


class SetValueSerializer(serializers.Serializer):
    date = serializers.DateField()
    value_cents = serializers.IntegerField()


class LoanTermsSerializer(serializers.Serializer):
    principal_cents = serializers.IntegerField()
    annual_rate = serializers.DecimalField(max_digits=7, decimal_places=4)
    term_months = serializers.IntegerField()
    first_payment_date = serializers.DateField()
    paid_from = serializers.PrimaryKeyRelatedField(queryset=Account.objects.all())
    payment_category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), allow_null=True, required=False, default=None
    )

    def validate_payment_category(self, category):
        return check_assignable(category)


class LinkSerializer(serializers.Serializer):
    transaction = serializers.PrimaryKeyRelatedField(queryset=Transaction.objects.all())


def _payment_info(payment):
    return {
        "id": payment.id,
        "date": payment.date,
        "payee": payment.payee,
        "amount_cents": payment.amount_cents,
        "account_id": payment.account_id,
        "account_name": payment.account.name,
    }


def _schedule_body(loan, today):
    """A loan's terms and its schedule with each installment's state - see
    openspec/specs/loan-schedules."""
    account = loan.account
    account.refresh_from_db()
    rows = loans.installment_states(loan, today)
    installments = [installment for installment, _, _ in rows]
    return {
        "account": account.id,
        "principal_cents": loan.principal_cents,
        "annual_rate": str(loan.annual_rate),
        "term_months": loan.term_months,
        "first_payment_date": loan.first_payment_date,
        "paid_from": loan.paid_from_id,
        "paid_from_name": loan.paid_from.name,
        "payment_category": loan.payment_category_id,
        "setup_date": loan.setup_date,
        "payment_cents": installments[0].payment_cents,
        "end_date": installments[-1].date,
        "current_balance_cents": account.current_balance_cents,
        "installments": [
            {
                "number": installment.number,
                "date": installment.date,
                "payment_cents": installment.payment_cents,
                "interest_cents": installment.interest_cents,
                "principal_cents": installment.principal_cents,
                "balance_after_cents": installment.balance_after_cents,
                "state": state,
                "payment": (
                    {**_payment_info(adjustment.loan_payment), "linked_by_hand": adjustment.loan_linked_by_hand}
                    if adjustment is not None and adjustment.loan_payment_id is not None
                    else None
                ),
            }
            for installment, state, adjustment in rows
        ],
    }


class AccountViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No destroy action: the accounts spec only defines archiving, not
    deleting, so DELETE is intentionally not exposed here."""

    serializer_class = AccountSerializer

    def get_queryset(self):
        # By tier, then name - see the accounts spec's "Accounts are
        # listed by tier".
        queryset = Account.objects.select_related("loan").order_by(tier_position(), "name", "id")
        if self.action == "list":
            # Archived accounts are excluded from the default list but
            # remain reachable by id (retrieve/update/archive), so their
            # history stays viewable per the accounts spec.
            queryset = queryset.filter(archived=False)
        return queryset

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        account = self.get_object()
        account.archived = True
        account.save(update_fields=["archived"])
        return Response(self.get_serializer(account).data)

    @action(detail=True, methods=["post"], url_path="set-value")
    def set_value(self, request, pk=None):
        """POST {"date", "value_cents"} records the account's value on that
        date as a value adjustment; see openspec/specs/value-adjustments.
        Returns the adjustment and the account's new balance."""
        account = self.get_object()
        body = SetValueSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            adjustment = set_value(account, body.validated_data["date"], body.validated_data["value_cents"])
        except AdjustmentError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        account.refresh_from_db()
        return Response(
            {
                "adjustment": TransactionSerializer(adjustment).data,
                "current_balance_cents": account.current_balance_cents,
            },
            status=status.HTTP_201_CREATED,
        )

    def _loan_or_error(self, account):
        """(loan, None), or (None, an error response) when the account
        can't have or doesn't have a loan setup."""
        if account.account_type != Account.AccountType.LOAN:
            return None, Response({"detail": "Only a loan account has a loan schedule."}, status=400)
        try:
            return account.loan, None
        except Loan.DoesNotExist:
            return None, Response({"detail": "This loan isn't set up."}, status=404)

    def _terms(self, request, account):
        """Validated terms, or raise LoanError / a validation error."""
        body = LoanTermsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        terms = body.validated_data
        loans.check_terms(account, terms["principal_cents"], terms["annual_rate"], terms["term_months"], terms["paid_from"])
        return dict(terms)

    @action(detail=True, methods=["get", "put", "delete"])
    def loan(self, request, pk=None):
        """GET the loan's terms and schedule (syncing first), PUT to set it
        up or change it, DELETE to remove it. See
        openspec/specs/loan-schedules."""
        account = self.get_object()
        today = timezone.localdate()
        if request.method == "PUT":
            try:
                terms = self._terms(request, account)
                if hasattr(account, "loan"):
                    loan = loans.edit_loan(account.loan, today, **terms)
                    code = status.HTTP_200_OK
                else:
                    loan = loans.set_up_loan(account, today, **terms)
                    code = status.HTTP_201_CREATED
            except loans.LoanError as e:
                return Response({"detail": str(e)}, status=400)
            return Response(_schedule_body(loan, today), status=code)

        loan, error = self._loan_or_error(account)
        if error:
            return error
        if request.method == "DELETE":
            loans.remove_loan(loan)
            return Response(status=status.HTTP_204_NO_CONTENT)
        loans.sync_loan(loan, today)
        return Response(_schedule_body(loan, today))

    @action(detail=True, methods=["post"], url_path="loan/preview")
    def loan_preview(self, request, pk=None):
        """POST terms to see what they would give, saving nothing."""
        account = self.get_object()
        try:
            terms = self._terms(request, account)
        except loans.LoanError as e:
            return Response({"detail": str(e)}, status=400)
        # A missing reverse one-to-one raises an AttributeError subclass.
        existing = getattr(account, "loan", None)
        return Response(loans.preview(account, timezone.localdate(), loan=existing, **terms))

    @action(detail=True, methods=["get"], url_path=r"loan/installments/(?P<number>\d+)/candidates")
    def loan_candidates(self, request, pk=None, number=None):
        """The outflows that could be this installment's payment."""
        loan, error = self._loan_or_error(self.get_object())
        if error:
            return error
        try:
            candidates = loans.link_candidates(loan, int(number))
        except loans.LoanError as e:
            return Response({"detail": str(e)}, status=400)
        return Response([_payment_info(t) for t in candidates])

    @action(detail=True, methods=["post", "delete"], url_path=r"loan/installments/(?P<number>\d+)/link")
    def loan_link(self, request, pk=None, number=None):
        """POST {"transaction"} links a payment by hand; DELETE unlinks a
        hand link. Both return the schedule."""
        loan, error = self._loan_or_error(self.get_object())
        if error:
            return error
        try:
            if request.method == "POST":
                body = LinkSerializer(data=request.data)
                body.is_valid(raise_exception=True)
                loans.link_payment(loan, int(number), body.validated_data["transaction"])
            else:
                loans.unlink_payment(loan, int(number))
        except loans.LoanError as e:
            return Response({"detail": str(e)}, status=400)
        return Response(_schedule_body(loan, timezone.localdate()))
