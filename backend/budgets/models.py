from django.core.exceptions import ValidationError
from django.db import models


class Category(models.Model):
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(
                fields=["name"],
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

    def clean(self):
        if self.parent_id is not None:
            if self.parent_id == self.id:
                raise ValidationError({"parent": "A category cannot be its own parent."})
            if self.parent.parent_id is not None:
                raise ValidationError(
                    {"parent": "A subcategory cannot itself be used as a parent (two levels max)."}
                )


class CategoryLimit(models.Model):
    """A monthly spending limit for a category.

    `month` holds the first-of-month date of a specific override, or
    NULL for the category's default limit (used by any month with no
    override of its own). The two partial unique constraints below
    enforce "at most one default per category" and "at most one override
    per category per month" - a plain unique_together on (category,
    month) wouldn't do this, since SQL treats every NULL as distinct from
    every other NULL.
    """

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
