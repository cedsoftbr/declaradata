import uuid
from typing import ClassVar

from django.db import models


class City(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    name = models.CharField(max_length=255)
    ibge_code = models.CharField(max_length=7)
    uf = models.CharField(max_length=2)

    class Meta:
        verbose_name = 'cidade'
        verbose_name_plural = 'cidades'
        ordering: ClassVar[list[str]] = ['uf', 'name']

    def __str__(self):
        return f'{self.name} - {self.uf}'
