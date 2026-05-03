import pytest

from apps.companies.models import Company
from apps.locations.models import City
from apps.persons.models import Person, PersonAddress


@pytest.mark.django_db
def test_company_creation_creates_person_automatically():
    # Setup: Create a city first
    city = City.objects.create(name='Test City', uf='SP', ibge_code='1234567')

    # Action: Create a company
    company = Company.objects.create(
        name='Auto Person Company',
        cnpj='11.222.333/0001-44',
        city=city,
        address='Main St',
        number='100',
    )

    # Assert: Check if Person was created
    person = Person.objects.filter(company=company, document=company.cnpj).first()
    assert person is not None
    assert person.name == company.name
    assert person.is_carrier is False

    # Assert: Check if PersonAddress was created
    address = PersonAddress.objects.filter(person=person).first()
    assert address is not None
    assert address.address == 'Main St'
    assert address.city == city


@pytest.mark.django_db
def test_company_creation_no_city_no_address():
    # Action: Create a company without city
    company = Company.objects.create(
        name='No City Company', cnpj='99.888.777/0001-66', city=None
    )

    # Assert: Person should still be created
    person = Person.objects.filter(company=company, document=company.cnpj).first()
    assert person is not None
    assert person.is_carrier is False

    # Assert: Address should NOT be created (because city is null)
    assert PersonAddress.objects.filter(person=person).count() == 0
