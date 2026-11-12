from rest_framework import serializers

from accounts.serializers import VisibleAccountField
from budgets.models import Category
from budgets import utils as budget_utils

from .expected import month_status, validation_errors
from .models import ExpectedItem


class ExpectedItemSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects, allow_null=True, required=False)
    account = VisibleAccountField(allow_null=True, required=False)
    # Where it stands this month - see forecasting/expected.py month_status.
    status = serializers.SerializerMethodField()
    received_on = serializers.SerializerMethodField()
    next_on = serializers.SerializerMethodField()

    class Meta:
        model = ExpectedItem
        fields = [
            "id",
            "name",
            "direction",
            "amount_cents",
            "day",
            "category",
            "account",
            "status",
            "received_on",
            "next_on",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_amount_cents(self, value):
        if value <= 0:
            raise serializers.ValidationError("Enter an amount above zero.")
        return value

    def validate(self, attrs):
        instance = self.instance
        category = attrs["category"] if "category" in attrs else getattr(instance, "category", None)
        account = attrs["account"] if "account" in attrs else getattr(instance, "account", None)
        errors = validation_errors(category, account)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def _status(self, item):
        cache = self.context.setdefault("_status", {})
        if item.pk not in cache:
            cache[item.pk] = month_status(
                item, budget_utils.today(), blocked=self.context.get("blocked"), tier=self.context.get("tier")
            )
        return cache[item.pk]

    def get_status(self, item):
        return self._status(item).status

    def get_received_on(self, item):
        return self._status(item).received_on

    def get_next_on(self, item):
        return self._status(item).next_on
