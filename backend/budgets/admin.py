from django.contrib import admin

from .models import Category, CategoryLimit


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name"]
    search_fields = ["name"]


@admin.register(CategoryLimit)
class CategoryLimitAdmin(admin.ModelAdmin):
    list_display = ["category", "month", "limit_cents"]
    list_filter = ["category"]
