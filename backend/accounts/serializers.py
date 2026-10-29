from rest_framework import serializers

from .models import Account, Loan


class AccountSerializer(serializers.ModelSerializer):
    current_balance_cents = serializers.ReadOnlyField()
    tier = serializers.ReadOnlyField()
    # A loan with a schedule: the ledger offers "Schedule" instead of "Set
    # value", and its paying account doesn't offer it as a transfer
    # target. See openspec/specs/loan-schedules.
    has_loan = serializers.SerializerMethodField()
    loan_paid_from = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            "id",
            "name",
            "account_type",
            "tier",
            "starting_balance_cents",
            "current_balance_cents",
            "has_loan",
            "loan_paid_from",
            "archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["archived", "created_at", "updated_at"]

    def _loan(self, obj):
        try:
            return obj.loan
        except Loan.DoesNotExist:
            return None

    def get_has_loan(self, obj):
        return self._loan(obj) is not None

    def get_loan_paid_from(self, obj):
        loan = self._loan(obj)
        return loan.paid_from_id if loan is not None else None

