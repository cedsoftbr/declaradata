from django.apps import AppConfig


class CompaniesConfig(AppConfig):
    name = 'apps.companies'

    def ready(self):  # noqa: PLR6301
        import apps.companies.signals  # noqa
