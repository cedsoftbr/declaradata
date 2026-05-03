from django.contrib import admin

from .models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('descricao', 'ncm', 'created_at')
    search_fields = ('descricao', 'ncm')
