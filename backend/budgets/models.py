from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from households.scoping import HouseholdOwned, HouseholdScoped


class Category(HouseholdOwned):
    """Exactly two levels: `parent` is null (top-level) or points at a
    top-level category. A category whose own `parent` is set can never
    itself be used as a parent - enforced here (clean(), a second line
    of defense for non-API writes like the admin) and in
    CategorySerializer.validate_parent (the primary enforcement for the
    API).

    Name uniqueness is per-level, not global: the two partial unique
    constraints below mirror the exact pattern CategoryLimit already
    uses for its default-vs-override limits, for the same reason - a
    plain unique_together on (parent, name) wouldn't stop two top-level
    categories (both parent=NULL) from sharing a name, since SQL treats
    every NULL as distinct from every other NULL.
    """

    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="subcategories"
    )
    # Only a top-level category can be a tab group; its subcategories are
    # the tabs. See budgets/tabs.py and openspec/specs/repayment-tabs.
    is_tab_group = models.BooleanField(default=False)

    class BudgetKind(models.TextChoices):
        MONTHLY = "monthly"
        YEARLY = "yearly"
        # Yearly on a date: one amount due on a day and month each year.
        TARGET = "target"
        # A list of fixed monthly bills - see budgets/bills.py.
        BILLS = "bills"

    # Monthly amounts live in CategoryLimit, yearly ones in YearlyBudget,
    # bills in Bill - see openspec/specs/yearly-budgets and bill-budgets.
    budget_kind = models.CharField(max_length=10, choices=BudgetKind.choices, default=BudgetKind.MONTHLY)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(
                fields=["household", "name"],
                condition=models.Q(parent__isnull=True),
                name="unique_top_level_category_name",
            ),
            models.UniqueConstraint(
                fields=["parent", "name"],
                condition=models.Q(parent__isnull=False),
                name="unique_subcategory_name_per_parent",
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def is_tab(self):
        return self.parent_id is not None and self.parent.is_tab_group

    def clean(self):
        if self.parent_id is not None:
            if self.parent_id == self.id:
                raise ValidationError({"parent": "A category cannot be its own parent."})
            if self.parent.parent_id is not None:
                raise ValidationError(
                    {"parent": "A subcategory cannot itself be used as a parent (two levels max)."}
                )


class CategoryLimit(HouseholdScoped):
    """A monthly spending limit for a category.

    `month` holds the first-of-month date of a specific override, or
    NULL for the category's default limit (used by any month with no
    override of its own). The two partial unique constraints below
    enforce "at most one default per category" and "at most one override
    per category per month" - a plain unique_together on (category,
    month) wouldn't do this, since SQL treats every NULL as distinct from
    every other NULL.
    """

    household_path = "category__household"

    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="limits")
    month = models.DateField(null=True, blank=True)
    limit_cents = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["category"],
                condition=models.Q(month__isnull=True),
                name="unique_default_limit_per_category",
            ),
            models.UniqueConstraint(
                fields=["category", "month"],
                condition=models.Q(month__isnull=False),
                name="unique_month_override_per_category",
            ),
        ]

    def __str__(self):
        scope = "default" if self.month is None else self.month.isoformat()
        return f"{self.category.name} ({scope}): {self.limit_cents}"


class YearlyBudget(HouseholdScoped):
    """A yearly or yearly-on-a-date budget's values from `from_year` on.

    One row per year in which the values changed: year Y uses the row
    with the largest from_year <= Y, or the oldest row when none is that
    early, so a budget always covers whole years. Editing writes the
    current year's row, which keeps earlier years as they were and gives
    one history line per year. The due fields are null for a plain
    yearly budget.
    """

    household_path = "category__household"

    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="yearly_budgets")
    from_year = models.PositiveSmallIntegerField()
    amount_cents = models.BigIntegerField()
    due_month = models.PositiveSmallIntegerField(null=True, blank=True)
    due_day = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-from_year"]
        constraints = [
            models.UniqueConstraint(fields=["category", "from_year"], name="unique_yearly_budget_per_year"),
        ]

    def __str__(self):
        return f"{self.category.name} ({self.from_year}+): {self.amount_cents}"


class Bill(HouseholdScoped):
    """One fixed monthly bill of a Bills category: its amount, due on `day`
    (the month's last day when it has fewer days). It counts from
    `from_month`, the first of the month it was added, and has no history:
    an edit applies to every month it counts in. See
    openspec/specs/bill-budgets."""

    household_path = "category__household"

    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="bills")
    name = models.CharField(max_length=255)
    day = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(31)])
    amount_cents = models.BigIntegerField(validators=[MinValueValidator(1)])
    from_month = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["day", "id"]

    def __str__(self):
        return f"{self.category.name}: {self.name} on the {self.day}"


class BudgetSettings(HouseholdScoped):
    """A household's one row of budget-wide settings; read with `load()`.

    `start_month` is the first-of-month date budgeting by year starts
    from, or null for "every year counts in full".
    """

    household = models.OneToOneField("households.Household", on_delete=models.PROTECT, related_name="+")
    start_month = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "budget settings"

    @classmethod
    def load(cls):
        settings, _created = cls.objects.get_or_create()
        return settings

    def __str__(self):
        return f"Budgeting from {self.start_month}" if self.start_month else "Budgeting from the start"
