FROM python:3.14-slim@sha256:5b3879b6f3cb77e712644d50262d05a7c146b7312d784a18eff7ff5462e77033

# Dependências de sistema
# - weasyprint: pango, cairo, gdk-pixbuf, gobject-introspection, harfbuzz, fontconfig
# - xmlsec / signxml: libxml2, libxmlsec1, pkg-config
# - lxml: libxslt
# - psycopg2-binary: libpq (já incluso no slim via dependência transitiva)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # WeasyPrint
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    fonts-dejavu-core \
    # xmlsec / lxml
    libxml2-dev \
    libxslt1-dev \
    libxmlsec1-dev \
    libxmlsec1-openssl \
    pkg-config \
    # Utilitários de build
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 appuser

WORKDIR /app

# Instala Poetry
RUN pip install --no-cache-dir poetry==2.3.4

# Copia apenas os arquivos de dependências primeiro (cache de camada)
COPY pyproject.toml poetry.lock* ./

# Instala dependências de produção (sem dev)
RUN poetry config virtualenvs.create false \
    && poetry install --only main --no-interaction --no-ansi

# Copia o restante do código
COPY . .

# Coleta arquivos estáticos no build sem depender de envs de runtime
RUN SECRET_KEY=build-secret \
    DEBUG=true \
    DATABASE_URL=sqlite:////tmp/build.db \
    python manage.py collectstatic --noinput

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Start command padrão (sobrescrito por cada serviço no Railway)
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
