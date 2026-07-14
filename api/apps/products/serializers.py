from rest_framework import serializers

from .models import NcmCatalog, Product


class NcmCatalogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NcmCatalog
        fields = ('id', 'ncm', 'created_at')
        read_only_fields = ('created_at',)


class ProductSerializer(serializers.ModelSerializer):
    company_id = serializers.PrimaryKeyRelatedField(
        source='company',
        queryset=Product.company.field.related_model.objects.all(),
        required=False,
    )

    class Meta:
        model = Product
        fields = (
            'id',
            'company_id',
            'descricao',
            'ncm',
            'unit_value',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at')

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        if request and request.user.is_authenticated and not request.user.is_superadmin:
            fields['company_id'].read_only = True
        return fields
