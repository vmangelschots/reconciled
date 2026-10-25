from django.contrib import admin

from .models import AccountImportSettings, ImportSession


@admin.register(ImportSession)
class ImportSessionAdmin(admin.ModelAdmin):
    list_display = ["account", "file_format", "preset", "status", "created_at"]
    list_filter = ["file_format", "preset", "status"]


@admin.register(AccountImportSettings)
class AccountImportSettingsAdmin(admin.ModelAdmin):
    list_display = ["account"]
