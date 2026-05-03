from rest_framework import serializers

from .models import Invoice, Plan


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = (
            'id',
            'name',
            'monthly_dce_limit',
            'active_user_limit',
            'price',
            'is_active',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class InvoiceSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = Invoice
        fields = (
            'id',
            'company',
            'company_name',
            'plan_name',
            'amount',
            'year',
            'month',
            'status',
            'due_date',
            'paid_at',
            'notes',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'company',
            'company_name',
            'plan_name',
            'amount',
            'year',
            'month',
            'due_date',
            'created_at',
            'updated_at',
        )
