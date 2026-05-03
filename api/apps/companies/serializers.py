from rest_framework import serializers

from apps.billing.models import Plan
from apps.billing.serializers import PlanSerializer
from apps.locations.serializers import CitySerializer

from .models import Company


class CompanySerializer(serializers.ModelSerializer):
    city = CitySerializer(read_only=True)
    city_id = serializers.PrimaryKeyRelatedField(
        source='city',
        queryset=Company.city.field.related_model.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    plan = PlanSerializer(read_only=True)
    plan_id = serializers.PrimaryKeyRelatedField(
        source='plan',
        queryset=Plan.objects.filter(is_active=True),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Company
        fields = (
            'id',
            'name',
            'trade_name',
            'cnpj',
            'contact_name',
            'contact_phone',
            'contact_email',
            'is_active',
            'zip_code',
            'address',
            'number',
            'complement',
            'neighborhood',
            'city',
            'city_id',
            'environment',
            'current_ambient',
            'use_sefaz_integration',
            'plan',
            'plan_id',
            'allow_simulated_environment_for_emitters',
        )


class CompanyEnvironmentSerializer(serializers.ModelSerializer):
    """Retorna/atualiza apenas configurações de ambiente da empresa."""

    class Meta:
        model = Company
        fields = ('environment', 'current_ambient')

    def update(self, instance, validated_data):
        environment = validated_data.get('environment')
        if environment is not None:
            instance.current_ambient = environment
        return super().update(instance, validated_data)
