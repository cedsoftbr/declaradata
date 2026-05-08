from typing import ClassVar

from django.db.models import Sum
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.users.permissions import IsSuperAdmin

from .models import Invoice, Plan
from .serializers import InvoiceSerializer, PlanSerializer
from .tasks import generate_monthly_invoices_task


class PlanViewSet(viewsets.ModelViewSet):
    serializer_class = PlanSerializer
    permission_classes: ClassVar[list] = [IsSuperAdmin]
    filter_backends: ClassVar[list] = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields: ClassVar[list] = ['is_active']
    search_fields: ClassVar[list] = ['name']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Plan.objects.none()
        return Plan.objects.all()


class InvoiceViewSet(
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = InvoiceSerializer
    permission_classes: ClassVar[list] = [IsSuperAdmin]
    filter_backends: ClassVar[list] = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields: ClassVar[list] = ['status', 'year', 'month', 'company']
    search_fields: ClassVar[list] = ['company__name', 'plan_name']
    ordering_fields: ClassVar[list] = [
        'year',
        'month',
        'company__name',
        'amount',
        'due_date',
    ]
    http_method_names: ClassVar[list] = ['get', 'patch', 'post', 'head', 'options']

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):
            return Invoice.objects.none()
        return Invoice.objects.select_related('company').all()

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):  # noqa: ARG002, PLR6301
        created = generate_monthly_invoices_task()
        return Response({'created': created}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):  # noqa: ARG002
        invoice = self.get_object()
        invoice.status = Invoice.Status.PAID
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=['status', 'paid_at', 'updated_at'])
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_200_OK)

    @staticmethod
    @action(detail=False, methods=['get'], url_path='monthly-summary')
    def monthly_summary(request):  # noqa: ARG004
        """
        GET /api/invoices/monthly-summary/
        Retorna valor a receber e valor já pago no mês corrente.
        """
        now = timezone.now()
        qs = Invoice.objects.filter(year=now.year, month=now.month)

        company_id = request.query_params.get('company')
        if company_id:
            qs = qs.filter(company_id=company_id)

        to_receive = qs.filter(
            status__in=[Invoice.Status.PENDING, Invoice.Status.OVERDUE]
        ).aggregate(total=Sum('amount'))['total'] or 0

        received = qs.filter(
            status=Invoice.Status.PAID
        ).aggregate(total=Sum('amount'))['total'] or 0

        return Response({
            'to_receive': str(to_receive),
            'received': str(received),
        })
