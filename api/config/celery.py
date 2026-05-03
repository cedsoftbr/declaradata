import os

from celery import Celery

# Define o módulo de configurações padrão do Django para o 'celery'
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('declaradata')

# Configura o Celery usando as configurações do Django (prefixo CELERY_)
app.config_from_object('django.conf:settings', namespace='CELERY')

# Carrega tasks de todos os aplicativos registrados no Django
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
