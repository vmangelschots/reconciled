from rest_framework import serializers

from .models import RecurringTransaction


class RecurringTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringTransaction
        fields = [
            "id",
            "account",
            "amount_cents",
            "payee",
            "category",
            "frequency",
            "start_date",
            "end_date",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]
