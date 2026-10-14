from django.contrib import admin

from .models import Account


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ["name", "account_type", "starting_balance_cents", "archived"]
    list_filter = ["account_type", "archived"]
    search_fields = ["name"]
