import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.persons.models import Person, PersonAddress

from .models import Company

logger = logging.getLogger('apps.companies')


@receiver(post_save, sender=Company)
def create_self_person_on_company_creation(instance, created, **_kwargs):
    """
    Cria automaticamente uma Pessoa (Person) correspondente à própria empresa
    quando ela é cadastrada. Isso permite que os usuários da empresa vejam
    a si mesmos na lista de contatos (como remetente ou transportador).
    """
    if not created:
        return

    try:
        # 1. Verifica se já existe (segurança contra duplicidade)
        if Person.objects.filter(company=instance, document=instance.cnpj).exists():
            return

        # 2. Cria a Pessoa vinculada à própria empresa (multitenancy)
        person = Person.objects.create(
            company=instance,
            name=instance.name,
            document=instance.cnpj,
            is_carrier=False,
            is_active=True,
        )

        # 3. Cria o endereço padrão da Pessoa (se houver cidade cadastrada)
        if instance.city:
            PersonAddress.objects.create(
                person=person,
                label='Matriz',
                contact_phone=instance.contact_phone,
                contact_email=instance.contact_email,
                zip_code=instance.zip_code,
                address=instance.address,
                number=instance.number,
                complement=instance.complement,
                neighborhood=instance.neighborhood,
                city=instance.city,
                is_default=True,
                is_active=True,
            )

        logger.info(
            'Pessoa autovinculada criada para a empresa %s (ID: %s)',
            instance.name,
            instance.id,
        )

    except Exception as e:
        logger.error(
            'Falha ao criar pessoa autovinculada para a empresa %s: %s',
            instance.id,
            e,
            exc_info=True,
        )
