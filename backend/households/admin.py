from django.contrib import admin, messages

from core.origin import public_origin

from .models import Household, Invite, Membership


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
    actions = ["create_invite_link"]

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if not change:
            self._show_new_invite(request, obj)

    @admin.action(description="Create invite link", permissions=["change"])
    def create_invite_link(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, "Select one household to create an invite link.", messages.ERROR)
            return
        self._show_new_invite(request, queryset.get())

    def _show_new_invite(self, request, household):
        # Plain text: this browser is signed in, so following the link here
        # would offer to add the operator instead of the person it's for.
        _invite, token = Invite.issue(household, request.user)
        link = f"{public_origin(request)}/invite/{token}"
        self.message_user(
            request,
            f"Invite link for {household.name}, shown only now. Copy it and send it to them: {link}",
            messages.SUCCESS,
        )
