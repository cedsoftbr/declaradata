from django.contrib import admin

from .models import Company


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'trade_name', 'cnpj', 'type', 'city', 'is_active')
    list_filter = ('type', 'is_active')
    search_fields = ('name', 'trade_name', 'cnpj')
    fieldsets = (
        (
            'Identificação',
            {
                'fields': (
                    'name',
                    'trade_name',
                    'cnpj',
                    'type',
                )
            },
        ),
        (
            'Endereço',
            {
                'fields': (
                    'zip_code',
                    'address',
                    'number',
                    'complement',
                    'neighborhood',
                    'city',
                )
            },
        ),
        ('Status', {'fields': ('is_active',)}),
    )
