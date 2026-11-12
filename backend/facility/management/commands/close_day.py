from datetime import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from facility.services import close_day_service

class Command(BaseCommand):
    help = 'Closes daily records for facility patients: marks missing readings and missed visits.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            help='Target date to close in YYYY-MM-DD format (defaults to yesterday)',
            default=None
        )

    def handle(self, *args, **options):
        date_str = options.get('date')
        target_date = None
        if date_str:
            try:
                target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                self.stderr.write(self.style.ERROR(f"Invalid date format: {date_str}. Use YYYY-MM-DD."))
                return

        count = close_day_service(target_date)
        resolved_date = target_date or (timezone.localdate() - timezone.timedelta(days=1))
        self.stdout.write(self.style.SUCCESS(f"Successfully closed day {resolved_date} for {count} active patients."))
