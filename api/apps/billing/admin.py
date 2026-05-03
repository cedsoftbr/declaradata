from django.contrib import admin

from .models import Invoice, Plan


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'price',
        'monthly_dce_limit',
        'active_user_limit',
        'is_active',
    )
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        'company',
        'plan_name',
        'amount',
        'year',
        'month',
        'status',
        'due_date',
        'paid_at',
    )
    list_filter = ('status', 'year', 'month')
    search_fields = ('company__name', 'plan_name')
    ordering = ('-year', '-month', 'company__name')
