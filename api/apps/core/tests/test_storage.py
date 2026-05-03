from unittest.mock import MagicMock, patch

from django.conf import settings

from apps.core.storage import R2Storage


def test_r2_storage_upload_file():
    with patch('boto3.client'):
        storage = R2Storage()
        content = b'test content'
        key = 'test.xml'
        content_type = 'application/xml'

        storage.upload_file(content, key, content_type)

        storage.s3_client.put_object.assert_called_once_with(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
            Body=content,
            ContentType=content_type,
        )


def test_r2_storage_get_file():
    with patch('boto3.client') as mock_client:
        mock_s3 = MagicMock()
        mock_client.return_value = mock_s3
        mock_s3.get_object.return_value = {
            'Body': MagicMock(read=lambda: b'file content')
        }

        storage = R2Storage()
        content = storage.get_file('test.xml')

        assert content == b'file content'
        mock_s3.get_object.assert_called_once_with(
            Bucket=settings.R2_BUCKET_NAME, Key='test.xml'
        )


def test_r2_storage_get_url_public():
    with (
        patch('boto3.client'),
        patch('django.conf.settings.R2_PUBLIC_DOMAIN', 'pub.r2.dev'),
    ):
        storage = R2Storage()
        url = storage.get_url('test.xml')
        assert url == 'https://pub.r2.dev/test.xml'


def test_r2_storage_get_url_signed():
    with (
        patch('boto3.client') as mock_client,
        patch('django.conf.settings.R2_PUBLIC_DOMAIN', ''),
    ):
        mock_s3 = MagicMock()
        mock_client.return_value = mock_s3
        mock_s3.generate_presigned_url.return_value = 'https://signed.url'

        storage = R2Storage()
        url = storage.get_url('test.xml')

        assert url == 'https://signed.url'
        mock_s3.generate_presigned_url.assert_called_once()
