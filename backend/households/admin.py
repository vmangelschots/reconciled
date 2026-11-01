from django.contrib import admin

from .models import Household, Membership


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 1
    fields = ["user", "last_used_at"]
    readonly_fields = ["last_used_at"]


@admin.register(Household)
class HouseholdAdmin(admin.ModelAdmin):
    """Budget data stays out of the admin, so invited households' figures do
    too. Delete a household with `manage.py delete_household`."""

    list_display = ["name", "created_at"]
    fields = ["name"]
    inlines = [MembershipInline]

    def has_delete_permission(self, request, obj=None):
        return False
