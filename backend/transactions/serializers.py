from rest_framework import serializers

from .models import Transaction


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
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

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
