from rest_framework import serializers

from . import utils
from .models import Category
from .yearly import values_for_year


def format_due(month, day):
    return f"{month:02d}-{day:02d}" if month else None


class CategorySerializer(serializers.ModelSerializer):
    is_tab = serializers.SerializerMethodField()
    # Rows assigned directly to this category, so the settings know when
    # changing a group's kind moves money in or out of the reports.
    transaction_count = serializers.SerializerMethodField()
    # The budget editor reads these to show the current amount and to know
    # what switching kind would remove - see openspec/specs/yearly-budgets.
    yearly = serializers.SerializerMethodField()
    yearly_history = serializers.SerializerMethodField()
    monthly_limits = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            "id",
            "name",
            "parent",
            "is_tab_group",
            "is_tab",
            "transaction_count",
            "budget_kind",
            "yearly",
            "yearly_history",
            "monthly_limits",
            "created_at",
            "updated_at",
        ]
        # The kind changes only through PUT .../budget/, with its amount.
        read_only_fields = ["budget_kind", "created_at", "updated_at"]

    def get_is_tab(self, category):
        return category.is_tab

    def get_transaction_count(self, category):
        count = getattr(category, "transaction_count", None)
        return category.transactions.count() if count is None else count

    def get_yearly(self, category):
        values = values_for_year(category.yearly_budgets.all(), utils.today().year)
        if values is None or category.budget_kind == Category.BudgetKind.MONTHLY:
            return None
        return {"amount_cents": values.amount_cents, "due": format_due(values.due_month, values.due_day)}

    def get_yearly_history(self, category):
        rows = sorted(category.yearly_budgets.all(), key=lambda r: -r.from_year)
        return [
            {"from_year": r.from_year, "amount_cents": r.amount_cents, "due": format_due(r.due_month, r.due_day)}
            for r in rows
        ]

    def get_monthly_limits(self, category):
        limits = list(category.limits.all())
        default = next((limit.limit_cents for limit in limits if limit.month is None), None)
        return {"default_cents": default, "override_count": sum(1 for limit in limits if limit.month is not None)}

    def validate_parent(self, parent):
        if parent is None:
            return parent
        if self.instance is not None and parent.id == self.instance.id:
            raise serializers.ValidationError("A category cannot be its own parent.")
        if parent.parent_id is not None:
            raise serializers.ValidationError(
                "A subcategory cannot itself be used as a parent (two levels max)."
            )
        return parent

    def validate(self, attrs):
        # DRF auto-generates a UniqueValidator from a field-level
        # unique=True, but name's uniqueness is now two conditional
        # Meta.constraints (per-level), which DRF does not introspect -
        # without this, a duplicate name hits the database's
        # IntegrityError directly and surfaces as a raw 500.
        name = attrs["name"] if "name" in attrs else getattr(self.instance, "name", None)
        parent = attrs["parent"] if "parent" in attrs else getattr(self.instance, "parent", None)
        if name is not None:
            clash = Category.objects.filter(name=name, parent=parent)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {"name": "A category with this name already exists at this level."}
                )
        self._validate_tab_group(attrs, parent)
        return attrs

    def _validate_tab_group(self, attrs, parent):
        is_tab_group = attrs.get("is_tab_group", getattr(self.instance, "is_tab_group", False))
        if not is_tab_group:
            return
        if parent is not None:
            raise serializers.ValidationError(
                {"is_tab_group": "Only a top-level category can be a tab group."}
            )
        if self.instance is not None and not self.instance.is_tab_group:
            count = self.instance.transactions.count()
            if count:
                raise serializers.ValidationError(
                    {
                        "is_tab_group": (
                            f"{count} transaction(s) are assigned to this category itself. "
                            "Reassign them before making it a tab group."
                        )
                    }
                )
