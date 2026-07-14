from django.db import migrations


def normalize_documents(apps, schema_editor):
    Person = apps.get_model('persons', 'Person')
    PersonAddress = apps.get_model('persons', 'PersonAddress')
    PersonCertificate = apps.get_model('persons', 'PersonCertificate')
    PersonAuditLog = apps.get_model('persons', 'PersonAuditLog')
    Shipment = apps.get_model('shipments', 'Shipment')
    Series = apps.get_model('shipments', 'Series')
    User = apps.get_model('users', 'User')

    groups = {}
    for person in Person.objects.all():
        digits = ''.join(filter(str.isdigit, person.document or ''))
        groups.setdefault((person.company_id, digits), []).append(person)

    for (_company_id, digits), people in groups.items():
        if not digits:
            continue

        # Mantém o registro mais recentemente atualizado; os demais são
        # duplicatas legadas (mesmo documento salvo com formatação diferente).
        people.sort(key=lambda p: p.updated_at, reverse=True)
        survivor, *duplicates = people

        for dup in duplicates:
            PersonAddress.objects.filter(person=dup).update(person=survivor)
            PersonCertificate.objects.filter(person=dup).update(person=survivor)
            PersonAuditLog.objects.filter(person=dup).update(person=survivor)
            Shipment.objects.filter(emitter=dup).update(emitter=survivor)
            Shipment.objects.filter(sender=dup).update(sender=survivor)
            Shipment.objects.filter(recipient=dup).update(recipient=survivor)
            Shipment.objects.filter(carrier=dup).update(carrier=survivor)
            Series.objects.filter(emitter=dup).update(emitter=survivor)
            for user in User.objects.filter(allowed_emitentes=dup):
                user.allowed_emitentes.remove(dup)
                user.allowed_emitentes.add(survivor)
            dup.delete()

        if survivor.document != digits:
            survivor.document = digits
            survivor.save(update_fields=['document'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('persons', '0014_person_indexes_emitente_carrier'),
        ('shipments', '0019_unique_active_series_per_emitter'),
        ('users', '0008_twofa_enabled'),
    ]

    operations = [
        migrations.RunPython(normalize_documents, noop),
    ]
