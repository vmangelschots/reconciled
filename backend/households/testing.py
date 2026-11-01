"""Test bases that put each test class in a household of its own, so the app's
tests read as they did before households. Users created during the test join
it. households/tests_isolation.py deliberately doesn't use these: a bound
household would hide a view that forgot to bind one."""

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.test import TestCase as DjangoTestCase

from .context import bind, current_household_or_none, unbind
from .models import Household, Membership


def _join_bound_household(sender, instance, created, **kwargs):
    household = current_household_or_none()
    if created and household is not None:
        Membership.objects.create(user=instance, household=household)


class TestCase(DjangoTestCase):
    @classmethod
    def _enter_atomics(cls):
        # Runs for the class, before setUpTestData and inside its transaction,
        # and again for each test.
        atomics = super()._enter_atomics()
        if "default_household" not in cls.__dict__:
            cls.default_household = Household.objects.create(name="Test household", ai_enabled=True)
            cls._household_token = bind(cls.default_household)
            post_save.connect(_join_bound_household, sender=get_user_model())
        return atomics

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        post_save.disconnect(_join_bound_household, sender=get_user_model())
        unbind(cls._household_token)
        del cls.default_household
