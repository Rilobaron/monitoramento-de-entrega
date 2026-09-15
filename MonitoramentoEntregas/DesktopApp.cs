using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using System.Xml.Linq;

namespace MonitoramentoEntregas
{
    internal enum DeliveryStatus { Entregue, Insucesso, BaixaPendente }

    internal sealed class DeliveryRecord
    {
        public string TrackingNumber, Driver;
        public DateTime DispatchTime;
        public DateTime? ProblemTime, DeliveryTime;
        public DeliveryStatus Status
        {
            get { return DeliveryTime.HasValue ? DeliveryStatus.Entregue : ProblemTime.HasValue ? DeliveryStatus.Insucesso : DeliveryStatus.BaixaPendente; }
        }
    }

    internal sealed class DriverSummary
    {
        public string Driver;
        public int Pending, Delivered, Failed, Total;
        public double Sla { get { return Total == 0 ? 0 : (double)Delivered / Total; } }
    }

    internal static class XlsxReader
    {
        private static readonly XNamespace Main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        private static readonly XNamespace OfficeRel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private static readonly XNamespace PackageRel = "http://schemas.openxmlformats.org/package/2006/relationships";

        public static List<DeliveryRecord> ReadDeliveries(string filePath)
        {
            using (FileStream file = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (ZipArchive archive = new ZipArchive(file, ZipArchiveMode.Read, false))
            {
                List<string> strings = ReadSharedStrings(archive);
                string sheetPath = FindFirstSheetPath(archive);
                ZipArchiveEntry sheetEntry = archive.GetEntry(sheetPath);
                if (sheetEntry == null) throw new InvalidDataException("A primeira aba não foi encontrada.");
                XDocument document;
                using (Stream stream = sheetEntry.Open()) document = XDocument.Load(stream);
                List<XElement> rows = document.Descendants(Main + "row").ToList();
                if (rows.Count == 0) return new List<DeliveryRecord>();
                Dictionary<string, int> header = ReadRow(rows[0], strings).ToDictionary(p => Normalize(p.Value), p => p.Key);
                int tracking = FindColumn(header, "numerodepedidojms", "运单编号");
                int dispatch = FindColumn(header, "tempodeentrega", "派件时间");
                int driver = FindColumn(header, "entregador", "派件员");
                int problem = FindColumn(header, "horarioregistropacoteproblematico", "问题件时间");
                int delivery = FindColumn(header, "horariodaentrega", "签收时间");
                List<DeliveryRecord> result = new List<DeliveryRecord>();
                foreach (XElement row in rows.Skip(1))
                {
                    Dictionary<int, string> cells = ReadRow(row, strings);
                    string code = Get(cells, tracking).Trim();
                    DateTime? dispatchDate = ParseExcelDate(Get(cells, dispatch));
                    if (code.Length == 0 || !dispatchDate.HasValue) continue;
                    string driverName = Get(cells, driver).Trim();
                    if (driverName.Length == 0) driverName = "SEM MOTORISTA";
                    result.Add(new DeliveryRecord {
                        TrackingNumber = code, DispatchTime = dispatchDate.Value, Driver = driverName,
                        ProblemTime = ParseExcelDate(Get(cells, problem)), DeliveryTime = ParseExcelDate(Get(cells, delivery))
                    });
                }
                return result;
            }
        }

        private static Dictionary<int, string> ReadRow(XElement row, IList<string> strings)
        {
            Dictionary<int, string> result = new Dictionary<int, string>();
            foreach (XElement cell in row.Elements(Main + "c"))
            {
                string reference = (string)cell.Attribute("r") ?? "A1";
                string type = (string)cell.Attribute("t");
                string value;
                if (type == "inlineStr") value = string.Concat(cell.Descendants(Main + "t").Select(x => x.Value));
                else
                {
                    XElement node = cell.Element(Main + "v");
                    value = node == null ? "" : node.Value;
                    int index;
                    if (type == "s" && int.TryParse(value, out index) && index >= 0 && index < strings.Count) value = strings[index];
                }
                result[ColumnNumber(reference)] = value;
            }
            return result;
        }

        private static List<string> ReadSharedStrings(ZipArchive archive)
        {
            ZipArchiveEntry entry = archive.GetEntry("xl/sharedStrings.xml");
            if (entry == null) return new List<string>();
            XDocument document;
            using (Stream stream = entry.Open()) document = XDocument.Load(stream);
            return document.Descendants(Main + "si").Select(x => string.Concat(x.Descendants(Main + "t").Select(t => t.Value))).ToList();
        }

        private static string FindFirstSheetPath(ZipArchive archive)
        {
            XDocument workbook, relationships;
            using (Stream stream = archive.GetEntry("xl/workbook.xml").Open()) workbook = XDocument.Load(stream);
            XElement sheet = workbook.Descendants(Main + "sheet").First();
            string relationshipId = (string)sheet.Attribute(OfficeRel + "id");
            using (Stream stream = archive.GetEntry("xl/_rels/workbook.xml.rels").Open()) relationships = XDocument.Load(stream);
            string target = (string)relationships.Descendants(PackageRel + "Relationship")
                .First(x => (string)x.Attribute("Id") == relationshipId).Attribute("Target");
            target = target.Replace('\\', '/').TrimStart('/');
            return target.StartsWith("xl/", StringComparison.OrdinalIgnoreCase) ? target : "xl/" + target;
        }

        private static int FindColumn(IDictionary<string, int> header, params string[] names)
        {
            foreach (string name in names) { int value; if (header.TryGetValue(Normalize(name), out value)) return value; }
            throw new InvalidDataException("Coluna obrigatória não encontrada: " + names[0] + ".");
        }

        private static string Get(IDictionary<int, string> cells, int column) { string value; return cells.TryGetValue(column, out value) ? value : ""; }
        private static int ColumnNumber(string reference)
        {
            int value = 0;
            foreach (char c in reference.TakeWhile(Char.IsLetter)) value = value * 26 + Char.ToUpperInvariant(c) - 'A' + 1;
            return value;
        }
        private static DateTime? ParseExcelDate(string value)
        {
            if (String.IsNullOrWhiteSpace(value)) return null;
            double serial; DateTime date;
            if (Double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out serial))
                try { return DateTime.FromOADate(serial); } catch (ArgumentException) { return null; }
            if (DateTime.TryParse(value, CultureInfo.GetCultureInfo("pt-BR"), DateTimeStyles.None, out date)) return date;
            return null;
        }
        private static string Normalize(string value)
        {
            string decomposed = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
            return string.Concat(decomposed.Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark && !Char.IsWhiteSpace(c) && c != '\n' && c != '\r'));
        }
    }

    internal sealed class MainForm : Form
    {
        private readonly Label fileLabel = new Label();
        private readonly DateTimePicker datePicker = new DateTimePicker();
        private readonly Button exportButton = new Button();
        private readonly DataGridView grid = new DataGridView();
        private readonly Label[] values = new Label[5];
        private List<DeliveryRecord> records = new List<DeliveryRecord>();
        private List<DriverSummary> summary = new List<DriverSummary>();

        public MainForm()
        {
            Text = "Monitoramento de Entregas - ITU"; MinimumSize = new Size(1050, 650); StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 10); BackColor = Color.FromArgb(245, 247, 250);
            Label title = new Label { Text = "Monitoramento de Entregas", Font = new Font("Segoe UI Semibold", 20), ForeColor = Color.FromArgb(17, 24, 39), AutoSize = true, Location = new Point(24, 20) };
            Label subtitle = new Label { Text = "Importe a planilha diária de bipagem para calcular o SLA geral e por motorista.", AutoSize = true, ForeColor = Color.FromArgb(75, 85, 99), Location = new Point(26, 62) };
            Button open = new Button { Text = "Selecionar planilha", Location = new Point(24, 98), Size = new Size(160, 36), BackColor = Color.FromArgb(31, 78, 121), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
            open.FlatAppearance.BorderSize = 0; open.Click += OpenFile;
            Controls.Add(title); Controls.Add(subtitle); Controls.Add(open);
            Controls.Add(new Label { Text = "Data:", AutoSize = true, Location = new Point(204, 107) });
            datePicker.Format = DateTimePickerFormat.Short; datePicker.Location = new Point(250, 103); datePicker.Width = 120; datePicker.ValueChanged += delegate { RefreshDashboard(); }; Controls.Add(datePicker);
            exportButton.Text = "Exportar CSV"; exportButton.Location = new Point(385, 102); exportButton.Size = new Size(120, 32); exportButton.Enabled = false; exportButton.Click += ExportCsv; Controls.Add(exportButton);
            fileLabel.Location = new Point(520, 104); fileLabel.Size = new Size(480, 28); fileLabel.ForeColor = Color.FromArgb(75, 85, 99); fileLabel.AutoEllipsis = true; Controls.Add(fileLabel);
            string[] cardTitles = { "TOTAL EXPEDIDO", "ENTREGUES", "BAIXAS PENDENTES", "INSUCESSOS", "SLA DO DIA" };
            for (int i = 0; i < 5; i++)
            {
                Panel card = new Panel { BackColor = Color.White, Location = new Point(24 + i * 198, 158), Size = new Size(184, 88), Anchor = AnchorStyles.Top | AnchorStyles.Left };
                card.Controls.Add(new Label { Text = cardTitles[i], Location = new Point(12, 10), Size = new Size(165, 20), ForeColor = Color.FromArgb(100, 116, 139), Font = new Font("Segoe UI Semibold", 8.5f) });
                values[i] = new Label { Text = "0", Location = new Point(12, 34), Size = new Size(165, 42), Font = new Font("Segoe UI Semibold", 20), ForeColor = Color.FromArgb(17, 24, 39) };
                card.Controls.Add(values[i]); Controls.Add(card);
            }
            ConfigureGrid(); Controls.Add(grid);
        }

        private void OpenFile(object sender, EventArgs e)
        {
            using (OpenFileDialog dialog = new OpenFileDialog { Filter = "Planilhas Excel (*.xlsx)|*.xlsx", Title = "Selecione a planilha de monitoramento de bipagem" })
            {
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                try
                {
                    Cursor = Cursors.WaitCursor; records = XlsxReader.ReadDeliveries(dialog.FileName);
                    if (records.Count == 0) throw new InvalidDataException("Nenhuma entrega válida foi encontrada.");
                    fileLabel.Text = Path.GetFileName(dialog.FileName); DateTime latest = records.Max(x => x.DispatchTime.Date);
                    datePicker.MinDate = records.Min(x => x.DispatchTime.Date); datePicker.MaxDate = latest; datePicker.Value = latest; RefreshDashboard();
                }
                catch (Exception ex) { MessageBox.Show(this, ex.Message, "Não foi possível importar", MessageBoxButtons.OK, MessageBoxIcon.Error); }
                finally { Cursor = Cursors.Default; }
            }
        }

        private void RefreshDashboard()
        {
            List<DeliveryRecord> selected = records.Where(x => x.DispatchTime.Date == datePicker.Value.Date).ToList();
            summary = selected.GroupBy(x => x.Driver, StringComparer.OrdinalIgnoreCase).Select(g => new DriverSummary {
                Driver = g.Key, Pending = g.Count(x => x.Status == DeliveryStatus.BaixaPendente), Delivered = g.Count(x => x.Status == DeliveryStatus.Entregue), Failed = g.Count(x => x.Status == DeliveryStatus.Insucesso), Total = g.Count()
            }).OrderByDescending(x => x.Sla).ThenBy(x => x.Driver).ToList();
            int total = selected.Count, delivered = selected.Count(x => x.Status == DeliveryStatus.Entregue), pending = selected.Count(x => x.Status == DeliveryStatus.BaixaPendente), failed = selected.Count(x => x.Status == DeliveryStatus.Insucesso);
            CultureInfo pt = CultureInfo.GetCultureInfo("pt-BR");
            values[0].Text = total.ToString("N0", pt); values[1].Text = delivered.ToString("N0", pt); values[2].Text = pending.ToString("N0", pt); values[3].Text = failed.ToString("N0", pt); values[4].Text = (total == 0 ? 0 : (double)delivered / total).ToString("P1", pt);
            grid.Rows.Clear(); foreach (DriverSummary item in summary) grid.Rows.Add(item.Driver, item.Pending, item.Delivered, item.Failed, item.Total, item.Sla); exportButton.Enabled = summary.Count > 0;
        }

        private void ExportCsv(object sender, EventArgs e)
        {
            using (SaveFileDialog dialog = new SaveFileDialog { Filter = "Arquivo CSV (*.csv)|*.csv", FileName = "SLA_" + datePicker.Value.ToString("yyyy-MM-dd") + ".csv" })
            {
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                StringBuilder csv = new StringBuilder("Motorista;Baixa pendente;Entregue;Insucesso;Total expedido;SLA\r\n"); CultureInfo pt = CultureInfo.GetCultureInfo("pt-BR");
                foreach (DriverSummary item in summary) csv.AppendLine(String.Format("\"{0}\";{1};{2};{3};{4};{5}", item.Driver.Replace("\"", "\"\""), item.Pending, item.Delivered, item.Failed, item.Total, item.Sla.ToString("P2", pt)));
                File.WriteAllText(dialog.FileName, csv.ToString(), new UTF8Encoding(true)); MessageBox.Show(this, "Resultado exportado com sucesso.", "Exportação concluída", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void ConfigureGrid()
        {
            grid.Location = new Point(24, 270); grid.Size = new Size(980, 330); grid.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right; grid.BackgroundColor = Color.White; grid.BorderStyle = BorderStyle.None; grid.AllowUserToAddRows = false; grid.AllowUserToDeleteRows = false; grid.ReadOnly = true; grid.RowHeadersVisible = false; grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill; grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect; grid.EnableHeadersVisualStyles = false; grid.ColumnHeadersDefaultCellStyle.BackColor = Color.FromArgb(31, 78, 121); grid.ColumnHeadersDefaultCellStyle.ForeColor = Color.White; grid.ColumnHeadersHeight = 38; grid.RowTemplate.Height = 30; grid.AlternatingRowsDefaultCellStyle.BackColor = Color.FromArgb(248, 250, 252);
            grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Motorista", FillWeight = 240 }); grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Baixa pendente", FillWeight = 90 }); grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Entregue", FillWeight = 80 }); grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Insucesso", FillWeight = 80 }); grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "Total expedido", FillWeight = 90 }); grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "SLA", FillWeight = 80, DefaultCellStyle = new DataGridViewCellStyle { Format = "P1", Alignment = DataGridViewContentAlignment.MiddleRight } });
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Length == 2 && args[0] == "--test")
            {
                List<DeliveryRecord> records = XlsxReader.ReadDeliveries(args[1]);
                DateTime date = records.Max(x => x.DispatchTime.Date);
                List<DeliveryRecord> selected = records.Where(x => x.DispatchTime.Date == date).ToList();
                int delivered = selected.Count(x => x.Status == DeliveryStatus.Entregue);
                int failed = selected.Count(x => x.Status == DeliveryStatus.Insucesso);
                int pending = selected.Count(x => x.Status == DeliveryStatus.BaixaPendente);
                Console.WriteLine(String.Format(CultureInfo.InvariantCulture, "date={0:yyyy-MM-dd};total={1};delivered={2};failed={3};pending={4};sla={5:F6};drivers={6}", date, selected.Count, delivered, failed, pending, selected.Count == 0 ? 0 : (double)delivered / selected.Count, selected.Select(x => x.Driver).Distinct(StringComparer.OrdinalIgnoreCase).Count()));
                return;
            }
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new MainForm());
        }
    }
}
