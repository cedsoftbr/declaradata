import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('companies', '0013_remove_company_state_registration'),
    ]

    operations = [
        migrations.CreateModel(
            name='Plan',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid7, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=100, unique=True, verbose_name='nome')),
                ('monthly_dce_limit', models.PositiveIntegerField(verbose_name='limite mensal de DC-e')),
                ('active_user_limit', models.PositiveIntegerField(verbose_name='limite de usuários ativos')),
                ('price', models.DecimalField(decimal_places=2, max_digits=10, verbose_name='preço mensal (R$)')),
                ('is_active', models.BooleanField(default=True, verbose_name='ativo')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'plano',
                'verbose_name_plural': 'planos',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='Invoice',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid7, editable=False, primary_key=True, serialize=False)),
                ('company', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='invoices',
                    to='companies.company',
                    verbose_name='empresa',
                )),
                ('plan_name', models.CharField(max_length=100, verbose_name='plano (snapshot)')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10, verbose_name='valor (R$)')),
                ('year', models.PositiveSmallIntegerField(verbose_name='ano')),
                ('month', models.PositiveSmallIntegerField(verbose_name='mês')),
                ('status', models.CharField(
                    choices=[('pending', 'Pendente'), ('paid', 'Pago'), ('overdue', 'Vencido'), ('cancelled', 'Cancelado')],
                    default='pending',
                    max_length=20,
                    verbose_name='status',
                )),
                ('due_date', models.DateField(verbose_name='vencimento')),
                ('paid_at', models.DateTimeField(blank=True, null=True, verbose_name='pago em')),
                ('notes', models.TextField(blank=True, verbose_name='observações')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'fatura',
                'verbose_name_plural': 'faturas',
                'ordering': ['-year', '-month', 'company__name'],
            },
        ),
        migrations.AddConstraint(
            model_name='invoice',
            constraint=models.UniqueConstraint(
                fields=['company', 'year', 'month'],
                name='unique_invoice_per_company_per_month',
            ),
        ),
    ]
