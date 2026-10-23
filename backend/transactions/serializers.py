from rest_framework import serializers

from .models import Transaction
from .transfers import mirror_edit, unlink_transfer


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
            "notes",
            "transfer",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["category_confirmed", "category_source", "created_at", "updated_at"]

    transfer = serializers.SerializerMethodField()

    def get_transfer(self, obj):
        counterpart = obj.transfer_counterpart
        if counterpart is None:
            return None
        return {
            "counterpart_id": counterpart.id,
            "account_id": counterpart.account_id,
            "account_name": counterpart.account.name,
        }

    def validate_amount_cents(self, value):
        if value == 0:
            raise serializers.ValidationError("Amount must not be zero.")
        return value

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
        return attrs

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
        # confirms it; only a different category changes its source. See
        # openspec/specs/auto-categorization.
        if "category" in validated_data:
            validated_data["category_confirmed"] = True
            if validated_data["category"] != instance.category:
                validated_data["category_source"] = Transaction.CategorySource.MANUAL
        instance = super().update(instance, validated_data)
        if instance.transfer_counterpart_id is not None and (
            "amount_cents" in validated_data or "date" in validated_data
        ):
            mirror_edit(instance)
        return instance
