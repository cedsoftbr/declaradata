from django.contrib import admin

from .models import Person, PersonAddress


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('name', 'document', 'is_carrier', 'company', 'is_active')
    list_filter = ('is_carrier', 'is_active')
    search_fields = ('name', 'document')
    fieldsets = (
        (
            'Identificação',
            {'fields': ('company', 'name', 'document', 'is_carrier')},
        ),
        ('Status', {'fields': ('is_active',)}),
    )


@admin.register(PersonAddress)
class PersonAddressAdmin(admin.ModelAdmin):
    list_display = ('person', 'label', 'city', 'is_default', 'is_active')
    list_filter = ('is_default', 'is_active', 'city__uf')
    search_fields = ('person__name', 'person__document', 'label', 'address')
