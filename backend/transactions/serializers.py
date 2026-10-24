from rest_framework import serializers

from accounts.models import Account
from budgets.models import Category
from budgets.tabs import check_assignable

from .models import Transaction
from .splits import SplitLine, sync_parts
from .transfers import mirror_edit, unlink_transfer


def transfer_info(obj):
    counterpart = obj.transfer_counterpart
    if counterpart is None:
        return None
    return {
        "counterpart_id": counterpart.id,
        "account_id": counterpart.account_id,
        "account_name": counterpart.account.name,
        "created_by_transfer": counterpart.created_by_transfer,
    }


class PartSerializer(serializers.ModelSerializer):
    """A part as listed inside its split transaction."""

    transfer = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = [
            "id",
            "amount_cents",
            "category",
            "category_confirmed",
            "category_source",
            "category_reason",
            "notes",
            "transfer",
        ]
        read_only_fields = fields

    def get_transfer(self, obj):
        return transfer_info(obj)


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "id",
            "account",
            "date",
            "amount_cents",
            "payee",
            "category",
            "category_confirmed",
            "category_source",
            "category_reason",
            "notes",
            "transfer",
            "split_parent",
            "parts",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "category_confirmed",
            "category_source",
            "category_reason",
            "split_parent",
            "created_at",
            "updated_at",
        ]

    transfer = serializers.SerializerMethodField()
    parts = serializers.SerializerMethodField()

    def get_transfer(self, obj):
        return transfer_info(obj)

    def get_parts(self, obj):
        # null for a part (it can't have parts), [] for an unsplit row.
        if obj.split_parent_id is not None:
            return None
        parts = sorted(obj.parts.all(), key=lambda p: p.pk)
        return PartSerializer(parts, many=True).data

    def validate_amount_cents(self, value):
        if value == 0:
            raise serializers.ValidationError("Amount must not be zero.")
        return value

    def validate_category(self, category):
        return check_assignable(category)

    def validate(self, attrs):
        # The transactions spec lists date/amount/payee/category/notes as
        # editable; account is deliberately not in that list, so a
        # transaction can't be moved to a different account after creation.
        new_account = attrs.get("account")
        if (
            self.instance is not None
            and new_account is not None
            and new_account != self.instance.account
        ):
            raise serializers.ValidationError(
                {"account": "A transaction's account cannot be changed after creation."}
            )
        if self.instance is not None:
            self._validate_split_edit(attrs)
        return attrs

    def _validate_split_edit(self, attrs):
        """A split's amount and the date/payee its parts share belong to
        the split transaction; see openspec/specs/transaction-splits."""
        instance = self.instance

        def changes(field):
            return field in attrs and attrs[field] != getattr(instance, field)

        if instance.split_parent_id is not None:
            locked = [f for f in ("amount_cents", "date", "payee") if changes(f)]
            if locked:
                raise serializers.ValidationError(
                    {f: "A part's amount, date and payee are changed by editing its split." for f in locked}
                )
        elif instance.parts.exists():
            if "category" in attrs:
                raise serializers.ValidationError(
                    {"category": "A split transaction has no category of its own. Edit or unsplit the split."}
                )
            if changes("amount_cents"):
                raise serializers.ValidationError({"amount_cents": "Unsplit to change the amount."})

    def create(self, validated_data):
        # The defaults (confirmed, manual) are already right for a category
        # the user picks; spelled out so create and update read the same.
        if "category" in validated_data:
            validated_data["category_confirmed"] = True
            validated_data["category_source"] = Transaction.CategorySource.MANUAL
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Choosing a category (or "no category") for a transfer unlinks it:
        # a transfer never has a category - see transactions/transfers.py.
        if "category" in validated_data and instance.transfer_counterpart_id is not None:
            unlink_transfer(instance)
            instance.refresh_from_db()
        # Any write of the category - even re-sending the current one -
        # confirms it; only a different category changes its source and
        # drops the AI's reason. See openspec/specs/auto-categorization.
        if "category" in validated_data:
            validated_data["category_confirmed"] = True
            if validated_data["category"] != instance.category:
                validated_data["category_source"] = Transaction.CategorySource.MANUAL
                validated_data["category_reason"] = ""
        instance = super().update(instance, validated_data)
        if instance.transfer_counterpart_id is not None and (
            "amount_cents" in validated_data or "date" in validated_data
        ):
            mirror_edit(instance)
        if ("date" in validated_data or "payee" in validated_data) and instance.parts.exists():
            sync_parts(instance)
        return instance


class SplitLineSerializer(serializers.Serializer):
    """One line of a PUT .../split/ body; see transactions/splits.py."""

    id = serializers.IntegerField(required=False, allow_null=True)
    amount_cents = serializers.IntegerField()
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), required=False, allow_null=True)
    transfer_account = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.all(), required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_category(self, category):
        return check_assignable(category)

    def to_line(self):
        return SplitLine(
            amount_cents=self.validated_data["amount_cents"],
            category=self.validated_data.get("category"),
            transfer_account=self.validated_data.get("transfer_account"),
            notes=self.validated_data.get("notes", ""),
            id=self.validated_data.get("id"),
        )
