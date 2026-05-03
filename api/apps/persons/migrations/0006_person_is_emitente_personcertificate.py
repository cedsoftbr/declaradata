import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('persons', '0005_remove_personaddress_municipal_registration'),
    ]

    operations = [
        migrations.AddField(
            model_name='person',
            name='is_emitente',
            field=models.BooleanField(default=False, verbose_name='é emitente DCe'),
        ),
        migrations.CreateModel(
            name='PersonCertificate',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid7, editable=False, primary_key=True, serialize=False)),
                ('cert_pfx', models.BinaryField(blank=True, help_text='Conteúdo do .pfx criptografado. Nunca retornado via API.', null=True, verbose_name='certificado A1 (cifrado)')),
                ('cert_password', models.CharField(blank=True, max_length=512, verbose_name='senha do certificado (cifrada)')),
                ('cert_expires_at', models.DateField(blank=True, null=True, verbose_name='validade do certificado')),
                ('cert_uploaded_at', models.DateTimeField(blank=True, null=True, verbose_name='enviado em')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('person', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='certificate',
                    to='persons.person',
                    verbose_name='pessoa',
                )),
            ],
            options={
                'verbose_name': 'certificado da pessoa',
                'verbose_name_plural': 'certificados das pessoas',
            },
        ),
    ]
