from django.contrib import admin

from .models import RecurringTransaction


@admin.register(RecurringTransaction)
class RecurringTransactionAdmin(admin.ModelAdmin):
    list_display = ["payee", "account", "amount_cents", "frequency", "start_date", "end_date"]
    list_filter = ["frequency", "account"]
