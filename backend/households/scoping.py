"""Keeps each household's rows to itself. Every model holding household data
extends HouseholdScoped, so `Model.objects` only ever sees the bound household
and raises when none is bound. all_households() is the one way out; a test
allowlists its callers (households/tests_isolation.py).

_base_manager stays Django's plain one on purpose: refresh_from_db, cascades and
following a foreign key work on a row already in hand."""

from django.db import models

from .context import current_household


class HouseholdQuerySet(models.QuerySet):
    def bulk_create(self, objs, *args, **kwargs):
        objs = list(objs)
        for obj in objs:
            obj.stamp_household()
        return super().bulk_create(objs, *args, **kwargs)


class HouseholdManager(models.Manager.from_queryset(HouseholdQuerySet)):
    def get_queryset(self):
        return super().get_queryset().filter(**{self.model.household_path: current_household()})

    def all_households(self):
        return super().get_queryset()


class HouseholdScoped(models.Model):
    """household_path is how a row reaches its household, declared once, so a
    row can't disagree with the parent it inherits from."""

    household_path = "household"

    objects = HouseholdManager()

    class Meta:
        abstract = True

    def stamp_household(self):
        if self.household_path == "household" and self.household_id is None:
            self.household = current_household()

    def save(self, *args, **kwargs):
        self.stamp_household()
        super().save(*args, **kwargs)


class HouseholdOwned(HouseholdScoped):
    """A row with its own link to a household."""

    household = models.ForeignKey("households.Household", on_delete=models.PROTECT, related_name="+")

    class Meta:
        abstract = True
