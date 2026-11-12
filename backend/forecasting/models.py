from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from households.scoping import HouseholdOwned


class ExpectedItem(HouseholdOwned):
    """Money the user expects every month that no bill, loan or budget
    already forecasts, such as a salary: about `amount_cents` on `day` (the
    month's last day when it has fewer). It is recognised by its category or
    by the account a transfer goes to or comes from - exactly one of the
    two. See openspec/specs/forecasting."""

    class Direction(models.TextChoices):
        IN = "in", "In"
        OUT = "out", "Out"

    name = models.CharField(max_length=255)
    direction = models.CharField(max_length=3, choices=Direction.choices)
    amount_cents = models.BigIntegerField(validators=[MinValueValidator(1)])
    day = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(31)])
    # SET_NULL: deleting the category or account leaves the item visible,
    # asking how to recognise it.
    category = models.ForeignKey(
        "budgets.Category", null=True, blank=True, on_delete=models.SET_NULL, related_name="expected_items"
    )
    account = models.ForeignKey(
        "accounts.Account", null=True, blank=True, on_delete=models.SET_NULL, related_name="expected_items"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["day", "name", "id"]

    @property
    def signed_cents(self):
        return self.amount_cents if self.direction == self.Direction.IN else -self.amount_cents

    def __str__(self):
        return f"{self.name} ({self.direction}, on the {self.day})"
