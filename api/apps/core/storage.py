import boto3
from botocore.config import Config
from django.conf import settings


class R2Storage:
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            endpoint_url=settings.R2_ENDPOINT_URL,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=Config(signature_version='s3v4'),
            region_name='auto',  # R2 usa 'auto'
        )
        self.bucket_name = settings.R2_BUCKET_NAME

    def upload_file(self, content: bytes, key: str, content_type: str):
        """Faz upload de bytes para o bucket R2."""
        self.s3_client.put_object(
            Bucket=self.bucket_name, Key=key, Body=content, ContentType=content_type
        )
        return key

    def get_file(self, key: str) -> bytes:
        """Busca o conteúdo de um arquivo no R2."""
        response = self.s3_client.get_object(Bucket=self.bucket_name, Key=key)
        return response['Body'].read()

    def get_url(self, key: str) -> str:
        """Retorna a URL pública ou assinada do arquivo."""
        if settings.R2_PUBLIC_DOMAIN:
            return f'https://{settings.R2_PUBLIC_DOMAIN}/{key}'

        # Se não tiver domínio público, gera URL assinada (expira em 1h)
        return self.s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': self.bucket_name, 'Key': key},
            ExpiresIn=3600,
        )

    def delete_file(self, key: str):
        """Remove um arquivo do bucket R2."""
        self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
