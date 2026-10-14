from rest_framework import serializers

from .models import Account


class AccountSerializer(serializers.ModelSerializer):
    current_balance_cents = serializers.ReadOnlyField()

    class Meta:
        model = Account
        fields = [
            "id",
            "name",
            "account_type",
            "starting_balance_cents",
            "current_balance_cents",
            "archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["archived", "created_at", "updated_at"]

    def validate(self, attrs):
        new_balance = attrs.get("starting_balance_cents")
        if (
            self.instance is not None
            and new_balance is not None
            and new_balance != self.instance.starting_balance_cents
            and self.instance.has_transactions
        ):
            raise serializers.ValidationError(
                {
                    "starting_balance_cents": (
                        "Starting balance can no longer be edited once the "
                        "account has transactions."
                    )
                }
            )
        return attrs
