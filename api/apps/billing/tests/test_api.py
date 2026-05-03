from datetime import date
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.billing.models import Invoice, Plan
from apps.billing.tasks import generate_monthly_invoices_task
from apps.companies.models import Company
from apps.users.models import User


def make_plan(**kwargs):
    defaults = {
        'name': 'Básico',
        'monthly_dce_limit': 100,
        'active_user_limit': 5,
        'price': Decimal('299.00'),
        'is_active': True,
    }
    defaults.update(kwargs)
    return Plan.objects.create(**defaults)


def make_company(plan=None, **kwargs):
    defaults = {
        'name': 'Empresa Teste',
        'cnpj': '12.345.678/0001-90',
        'is_active': True,
    }
    defaults.update(kwargs)
    c = Company.objects.create(**defaults)
    if plan:
        c.plan = plan
        c.save(update_fields=['plan'])
    return c


class PlanViewSetTests(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_superuser(
            email='admin@test.com', password='password123'
        )
        self.plan = make_plan()
        self.list_url = reverse('plan-list')

    def _detail_url(self, pk):
        return reverse('plan-detail', kwargs={'pk': pk})

    def test_list_plans_superadmin(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get(self.list_url)
        assert res.status_code == status.HTTP_200_OK
        assert res.data['count'] == 1

    def test_list_plans_unauthenticated(self):
        res = self.client.get(self.list_url)
        assert res.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_plans_regular_user_forbidden(self):
        company = make_company()
        user = User.objects.create_user(
            email='user@test.com', password='p', company=company
        )
        self.client.force_authenticate(user=user)
        res = self.client.get(self.list_url)
        assert res.status_code == status.HTTP_403_FORBIDDEN

    def test_create_plan(self):
        self.client.force_authenticate(user=self.superadmin)
        data = {
            'name': 'Pro',
            'monthly_dce_limit': 500,
            'active_user_limit': 10,
            'price': '599.00',
            'is_active': True,
        }
        res = self.client.post(self.list_url, data, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert Plan.objects.filter(name='Pro').exists()

    def test_create_plan_duplicate_name(self):
        self.client.force_authenticate(user=self.superadmin)
        data = {
            'name': 'Básico',
            'monthly_dce_limit': 100,
            'active_user_limit': 5,
            'price': '299.00',
        }
        res = self.client.post(self.list_url, data, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_plan(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.patch(
            self._detail_url(self.plan.pk),
            {'price': '349.00'},
            format='json',
        )
        assert res.status_code == status.HTTP_200_OK
        self.plan.refresh_from_db()
        assert self.plan.price == Decimal('349.00')

    def test_delete_plan(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.delete(self._detail_url(self.plan.pk))
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not Plan.objects.filter(pk=self.plan.pk).exists()

    def test_filter_by_is_active(self):
        make_plan(name='Inativo', price='0.00', is_active=False)
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get(self.list_url + '?is_active=true')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['count'] == 1


class InvoiceViewSetTests(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_superuser(
            email='admin@test.com', password='password123'
        )
        self.plan = make_plan()
        self.company = make_company(plan=self.plan)
        self.invoice = Invoice.objects.create(
            company=self.company,
            plan_name=self.plan.name,
            amount=self.plan.price,
            year=2026,
            month=5,
            status=Invoice.Status.PENDING,
            due_date=date(2026, 5, 10),
        )
        self.list_url = reverse('invoice-list')

    def _detail_url(self, pk):
        return reverse('invoice-detail', kwargs={'pk': pk})

    def _mark_paid_url(self, pk):
        return reverse('invoice-mark-paid', kwargs={'pk': pk})

    def _generate_url(self):
        return reverse('invoice-generate')

    def test_list_invoices_superadmin(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get(self.list_url)
        assert res.status_code == status.HTTP_200_OK
        assert res.data['count'] == 1

    def test_cannot_create_invoice_via_api(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.post(self.list_url, {}, format='json')
        assert res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_cannot_delete_invoice_via_api(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.delete(self._detail_url(self.invoice.pk))
        assert res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_update_invoice_notes(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.patch(
            self._detail_url(self.invoice.pk),
            {'notes': 'Pago via PIX'},
            format='json',
        )
        assert res.status_code == status.HTTP_200_OK
        self.invoice.refresh_from_db()
        assert self.invoice.notes == 'Pago via PIX'

    def test_mark_paid(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.post(self._mark_paid_url(self.invoice.pk))
        assert res.status_code == status.HTTP_200_OK
        self.invoice.refresh_from_db()
        assert self.invoice.status == Invoice.Status.PAID
        assert self.invoice.paid_at is not None

    def test_filter_by_status(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get(self.list_url + '?status=paid')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['count'] == 0

    def test_filter_by_year_month(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.get(self.list_url + '?year=2026&month=5')
        assert res.data['count'] == 1
        res2 = self.client.get(self.list_url + '?year=2025&month=1')
        assert res2.data['count'] == 0

    def test_generate_creates_invoices(self):
        Invoice.objects.all().delete()
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.post(self._generate_url())
        assert res.status_code == status.HTTP_200_OK
        assert res.data['created'] >= 1

    def test_generate_is_idempotent(self):
        self.client.force_authenticate(user=self.superadmin)
        res = self.client.post(self._generate_url())
        assert res.status_code == status.HTTP_200_OK
        assert res.data['created'] == 0


class GenerateMonthlyInvoicesTaskTests(APITestCase):
    def setUp(self):
        self.plan = make_plan()
        self.company = make_company(plan=self.plan)

    def test_creates_invoice_for_active_company_with_plan(self):
        result = generate_monthly_invoices_task()
        assert result >= 1
        today = date.today()
        assert Invoice.objects.filter(
            company=self.company, year=today.year, month=today.month
        ).exists()

    def test_idempotent_does_not_duplicate(self):
        generate_monthly_invoices_task()
        result = generate_monthly_invoices_task()
        assert result == 0
        today = date.today()
        assert (
            Invoice.objects.filter(
                company=self.company, year=today.year, month=today.month
            ).count()
            == 1
        )

    def test_skips_company_without_plan(self):
        no_plan_company = make_company(name='Sem Plano', cnpj='99.999.999/0001-99')
        generate_monthly_invoices_task()
        today = date.today()
        assert not Invoice.objects.filter(
            company=no_plan_company, year=today.year, month=today.month
        ).exists()

    def test_skips_inactive_company(self):
        inactive = make_company(
            name='Inativa', cnpj='11.111.111/0001-11', is_active=False, plan=self.plan
        )
        generate_monthly_invoices_task()
        today = date.today()
        assert not Invoice.objects.filter(
            company=inactive, year=today.year, month=today.month
        ).exists()

    def test_invoice_snapshots_plan_data(self):
        generate_monthly_invoices_task()
        today = date.today()
        inv = Invoice.objects.get(
            company=self.company, year=today.year, month=today.month
        )
        assert inv.plan_name == self.plan.name
        assert inv.amount == self.plan.price
