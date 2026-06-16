from django.db import transaction
from rest_framework import serializers

from apps.billing.models import Plan
from apps.billing.serializers import PlanSerializer
from apps.locations.serializers import CitySerializer
from apps.persons.models import Person
from apps.shipments.models import Series

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
            validated_data['current_ambient'] = environment

        new_ambient = validated_data.get('current_ambient', instance.current_ambient)
        ambient_changed = new_ambient != instance.current_ambient

        with transaction.atomic():
            result = super().update(instance, validated_data)
            if ambient_changed:
                self._sync_series_for_company(instance, new_ambient)
        return result

    @staticmethod
    def _sync_series_for_company(company, ambient):
        emitters = Person.objects.filter(company=company, is_emitente=True)
        for emitter in emitters:
            active = Series.objects.filter(emitter=emitter, is_active=True).first()
            if active and active.ambient == ambient:
                continue
            target = Series.objects.filter(emitter=emitter, ambient=ambient).first()
            if not target:
                target = Series.objects.create(
                    company=company,
                    emitter=emitter,
                    ambient=ambient,
                    code=emitter.preferred_series or 1,
                    last_number=0,
                )
            Series.objects.filter(emitter=emitter, is_active=True).exclude(
                pk=target.pk
            ).update(is_active=False)
            if not target.is_active:
                target.is_active = True
                target.save(update_fields=['is_active', 'updated_at'])
