"""
Factory Boy factories para todos os modelos principais.

Uso nos testes:

    from apps.core.factories import UserFactory, ShipmentFactory

    user = UserFactory()                        # empresa e role criados automaticamente
    superadmin = UserFactory(is_staff=True, is_superuser=True)
    shipment = ShipmentFactory(company=user.company)
"""

from datetime import timedelta

import factory
from django.utils import timezone
from factory.django import DjangoModelFactory

from apps.companies.models import Company
from apps.locations.models import City
from apps.persons.models import Person, PersonAddress, PersonCertificate
from apps.products.models import Product
from apps.shipments.models import Shipment, ShipmentItem
from apps.users.models import Role, RolePermission, User


class CityFactory(DjangoModelFactory):
    class Meta:
        model = City
        django_get_or_create = ('ibge_code',)

    name = factory.Sequence(lambda n: f'Cidade {n}')
    uf = 'PR'
    ibge_code = factory.Sequence(lambda n: f'{4100000 + n}')


class CompanyFactory(DjangoModelFactory):
    class Meta:
        model = Company

    name = factory.Sequence(lambda n: f'Empresa {n}')
    cnpj = factory.Sequence(lambda n: f'{n:014d}')
    city = factory.SubFactory(CityFactory)
    is_active = True


class RoleFactory(DjangoModelFactory):
    class Meta:
        model = Role

    name = factory.Sequence(lambda n: f'Role {n}')
    company = factory.SubFactory(CompanyFactory)
    can_manage_users = False


class RolePermissionFactory(DjangoModelFactory):
    class Meta:
        model = RolePermission

    role = factory.SubFactory(RoleFactory)
    module = Role.Module.DCE
    can_view = True
    can_create = False
    can_edit = False
    can_delete = False


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f'user{n}@declaradata.com.br')
    first_name = factory.Faker('first_name')
    last_name = factory.Faker('last_name')
    password = factory.PostGenerationMethodCall('set_password', 'senha123')
    company = factory.SubFactory(CompanyFactory)
    role = factory.SubFactory(RoleFactory, company=factory.SelfAttribute('..company'))
    is_active = True
    is_staff = False
    is_superuser = False
    can_manage_users = False
    profile = User.Profile.EMISSOR

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        # O modelo sincroniza profile e can_manage_users no save()
        # mas permitimos passar explicitamente aqui.
        return super()._create(model_class, *args, **kwargs)


class SuperAdminFactory(UserFactory):
    """Superadmin com acesso irrestrito."""

    is_staff = True
    is_superuser = True
    company = None
    role = None


class PersonFactory(DjangoModelFactory):
    class Meta:
        model = Person
        django_get_or_create = ('company', 'document')
        skip_postgeneration_save = True

    company = factory.SubFactory(CompanyFactory)
    name = factory.Faker('company', locale='pt_BR')
    # CNPJ fictício com dígitos verificadores válidos
    document = factory.Sequence(lambda n: f'{n:014d}')
    is_active = True
    is_carrier = False

    class Params:
        # Parâmetros que não vão para o modelo Person
        # Usamos factory.Trait ou apenas definimos valores padrão aqui
        # que podem ser sobrescritos no chamado da factory
        address_city = None
        address_zip_code = '80000000'
        address_street = 'Rua Teste'
        address_number = '1'
        address_complement = ''
        address_neighborhood = 'Centro'

    @factory.post_generation
    def create_address(self, create, extracted, **kwargs):
        if not create:
            return

        if extracted:
            return

        # Para acessar os Params em post_generation:
        # O FactoryBoy passa os valores em kwargs se eles foram passados para a Factory.
        # Se não foram passados, pegamos os defaults.

        # IMPORTANTE: self aqui é a instância de Person.
        # Não podemos usar self.address_city se ele não existir no modelo.

        # No FactoryBoy 3+, Params são acessíveis via factory.Params
        # mas no hook post_generation, o jeito mais seguro é usar kwargs
        # ou definir atributos na factory que não estão no Meta.model.

        # Vamos usar uma abordagem direta:
        city = kwargs.get('address_city') or CityFactory()

        PersonAddress.objects.create(
            person=self,
            label='Principal',
            city=city,
            zip_code=kwargs.get('address_zip_code', '80000000'),
            address=kwargs.get('address_street', 'Rua Teste'),
            number=kwargs.get('address_number', '1'),
            complement=kwargs.get('address_complement', ''),
            neighborhood=kwargs.get('address_neighborhood', 'Centro'),
            is_default=True,
            is_active=True,
        )


class CarrierFactory(PersonFactory):
    """Pessoa marcada como transportadora."""

    is_carrier = True


class PersonCertificateFactory(DjangoModelFactory):
    class Meta:
        model = PersonCertificate

    person = factory.SubFactory(PersonFactory)
    cert_pfx = b'fake-pfx'
    cert_password = 'password'
    cert_expires_at = factory.LazyFunction((timezone.now() + timedelta(days=365)).date)

    cert_uploaded_at = factory.LazyFunction(timezone.now)


class ProductFactory(DjangoModelFactory):
    class Meta:
        model = Product

    company = factory.SubFactory(CompanyFactory)
    descricao = factory.Sequence(lambda n: f'Produto {n}')
    ncm = factory.Sequence(lambda n: f'{n:08d}')


class ShipmentFactory(DjangoModelFactory):
    class Meta:
        model = Shipment

    company = factory.SubFactory(CompanyFactory)
    emitter = factory.SubFactory(
        PersonFactory, company=factory.SelfAttribute('..company'), is_emitente=True
    )
    recipient = factory.SubFactory(
        PersonFactory, company=factory.SelfAttribute('..company')
    )
    tp_emit = Shipment.EmitType.PROPRIO
    tp_amb = Shipment.Ambient.HOMOLOGACAO
    transport_mode = Shipment.TransportMode.RODOVIARIO
    tp_transp = Shipment.TpTransp.PROPRIO
    status = Shipment.Status.DRAFT
    number = factory.Sequence(lambda n: n + 1)
    c_dc = factory.Sequence(lambda n: f'{n:08d}')

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        """
        FSMField(protected=True) bloqueia atribuição direta de status.
        Para testes que precisam de status != DRAFT, criamos em DRAFT
        e usamos update() para contornar a proteção do FSM.
        """
        desired_status = kwargs.pop('status', Shipment.Status.DRAFT)
        obj = super()._create(model_class, *args, **kwargs)
        if obj.status != desired_status:
            Shipment.objects.filter(pk=obj.pk).update(status=desired_status)
            obj.refresh_from_db()
        return obj


class ShipmentItemFactory(DjangoModelFactory):
    class Meta:
        model = ShipmentItem

    shipment = factory.SubFactory(ShipmentFactory)
    product = factory.SubFactory(
        ProductFactory, company=factory.SelfAttribute('..shipment.company')
    )
    x_prod = factory.Faker('word')
    ncm = factory.Sequence(lambda n: f'{n:08d}')
    n_item = factory.Sequence(lambda n: n + 1)
    q_com = 1.0
    v_un_com = factory.Faker('pydecimal', left_digits=4, right_digits=2, positive=True)
    v_prod = factory.LazyAttribute(lambda o: round(o.q_com * float(o.v_un_com), 2))
