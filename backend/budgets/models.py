from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


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
