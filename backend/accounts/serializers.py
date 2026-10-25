from rest_framework import serializers

from .models import Account


class AccountSerializer(serializers.ModelSerializer):
    current_balance_cents = serializers.ReadOnlyField()
    tier = serializers.ReadOnlyField()

    class Meta:
        model = Account
        fields = [
            "id",
            "name",
            "account_type",
            "tier",
            "starting_balance_cents",
            "current_balance_cents",
            "archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["archived", "created_at", "updated_at"]

