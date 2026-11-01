"""The operator's route to new households. See openspec/specs/households."""

import re

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Household, Invite

User = get_user_model()
ADD = "admin:households_household_add"
LIST = "admin:households_household_changelist"
LINK = re.compile(r"https://budget\.example\.org/invite/([\w-]+)")
ORIGIN = {"Origin": "https://budget.example.org"}


# Admin pages link to static files, and tests run without collectstatic.
@override_settings(STORAGES={"staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}})
class Base(TestCase):
    def setUp(self):
        self.operator = User.objects.create_superuser("operator", password="x")
        self.client.force_login(self.operator)

    def add(self, name):
        return self.client.post(
            reverse(ADD),
            {
                "name": name,
                "memberships-TOTAL_FORMS": 0,
                "memberships-INITIAL_FORMS": 0,
            },
            headers=ORIGIN,
            follow=True,
        )

    def act(self, *households):
        return self.client.post(
            reverse(LIST),
            {"action": "create_invite_link", "_selected_action": [h.pk for h in households]},
            headers=ORIGIN,
            follow=True,
        )


class AddingAHouseholdTests(Base):
    def test_shows_a_link_that_lets_someone_in(self):
        response = self.add("The Peeters household")
        token = LINK.search(response.content.decode()).group(1)

        invite = Invite.objects.get()
        self.assertEqual(invite.household.name, "The Peeters household")
        self.assertEqual(invite.created_by, self.operator)
        accepted = APIClient().post(
            f"/api/invites/{token}/accept/", {"username": "newbie", "password": "correct horse battery"}, format="json"
        )
        self.assertEqual(accepted.status_code, 200, accepted.content)
        self.assertEqual(accepted.json()["household"]["name"], "The Peeters household")

    def test_the_link_is_text_not_something_to_follow(self):
        response = self.add("The Peeters household")
        self.assertNotRegex(response.content.decode(), r'href="[^"]*/invite/')

    def test_a_name_with_markup_is_escaped(self):
        response = self.add("<b>Peeters</b>")
        self.assertContains(response, "Invite link for &lt;b&gt;Peeters&lt;/b&gt;")

    def test_editing_makes_no_invite(self):
        household = Household.objects.create(name="Before")
        self.client.post(
            reverse("admin:households_household_change", args=[household.pk]),
            {"name": "After", "memberships-TOTAL_FORMS": 0, "memberships-INITIAL_FORMS": 0},
        )
        household.refresh_from_db()
        self.assertEqual(household.name, "After")
        self.assertFalse(Invite.objects.exists())

    def test_returning_to_the_household_shows_no_link(self):
        self.add("The Peeters household")
        household = Household.objects.get()
        for url in (reverse(LIST), reverse("admin:households_household_change", args=[household.pk])):
            self.assertNotContains(self.client.get(url), "/invite/")


class CreateInviteLinkActionTests(Base):
    def setUp(self):
        super().setUp()
        self.peeters = Household.objects.create(name="Peeters")
        self.janssens = Household.objects.create(name="Janssens")

    def test_one_household_gets_a_new_link(self):
        response = self.act(self.peeters)
        self.assertRegex(response.content.decode(), LINK)
        self.assertEqual(Invite.objects.get().household, self.peeters)

    def test_several_households_get_nothing(self):
        response = self.act(self.peeters, self.janssens)
        self.assertContains(response, "Select one household to create an invite link.")
        self.assertFalse(Invite.objects.exists())

    def test_staff_without_change_rights_are_not_offered_it(self):
        viewer = User.objects.create_user("viewer", password="x", is_staff=True)
        viewer.user_permissions.add(Permission.objects.get(codename="view_household"))
        self.client.force_login(viewer)

        self.assertNotContains(self.client.get(reverse(LIST)), "create_invite_link")
        self.act(self.peeters)
        self.assertFalse(Invite.objects.exists())
