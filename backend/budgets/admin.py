from django.contrib import admin

from .models import BudgetSettings, Category, CategoryLimit, YearlyBudget


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "budget_kind"]
    search_fields = ["name"]


@admin.register(CategoryLimit)
class CategoryLimitAdmin(admin.ModelAdmin):
    list_display = ["category", "month", "limit_cents"]
    list_filter = ["category"]


@admin.register(YearlyBudget)
class YearlyBudgetAdmin(admin.ModelAdmin):
    list_display = ["category", "from_year", "amount_cents", "due_month", "due_day"]
    list_filter = ["category"]


admin.site.register(BudgetSettings)
