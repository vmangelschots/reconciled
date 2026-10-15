from django.contrib import admin

from .models import Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ["date", "account", "payee", "amount_cents", "category"]
    list_filter = ["account", "category"]
    search_fields = ["payee", "notes"]
