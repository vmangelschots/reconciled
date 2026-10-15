from django.contrib import admin

from .models import ImportSession


@admin.register(ImportSession)
class ImportSessionAdmin(admin.ModelAdmin):
    list_display = ["account", "file_format", "status", "created_at"]
    list_filter = ["file_format", "status"]
