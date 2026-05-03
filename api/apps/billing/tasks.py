import logging
from datetime import date

from celery import shared_task

from apps.companies.models import Company

from .models import Invoice

logger = logging.getLogger(__name__)


@shared_task
def generate_monthly_invoices_task():
    """Gera faturas para todas as empresas ativas com plano no início do mês."""
    today = date.today()
    due = date(today.year, today.month, 10)

    companies = Company.objects.filter(
        is_active=True, plan__isnull=False
    ).select_related('plan')

    created = 0
    for company in companies:
        _, ok = Invoice.objects.get_or_create(
            company=company,
            year=today.year,
            month=today.month,
            defaults={
                'plan_name': company.plan.name,
                'amount': company.plan.price,
                'due_date': due,
                'status': Invoice.Status.PENDING,
            },
        )
        if ok:
            created += 1

    logger.info('generate_monthly_invoices: %d faturas criadas.', created)
    return created
