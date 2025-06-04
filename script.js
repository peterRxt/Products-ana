document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const columnMapping = document.getElementById('columnMapping');
    const mappingFields = document.getElementById('mappingFields');
    const confirmMappingBtn = document.getElementById('confirmMappingBtn');
    const analysisType = document.getElementById('analysisType');
    const analysisParams = document.getElementById('analysisParams');
    const runAnalysisBtn = document.getElementById('runAnalysisBtn');
    const chartType = document.getElementById('chartType');
    const generateChartBtn = document.getElementById('generateChartBtn');
    const messageArea = document.getElementById('messageArea');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const resultsSections = document.querySelectorAll('.results-section');
    const resultsTable = document.getElementById('resultsTable').querySelector('tbody');
    const chartCanvas = document.getElementById('chartCanvas');
    const exportBtn = document.getElementById('exportBtn');
    const exportChartBtn = document.getElementById('exportChartBtn');
    const resetBtn = document.getElementById('resetBtn');
    const homeBtn = document.getElementById('homeBtn');

    // Global Variables
    let uploadedData = [];
    let uploadedRows = [];
    let mappedColumns = {};
    let currentReportData = [];
    let currentChart = null;

    // Initialize the application
    init();

    function init() {
        setupEventListeners();
        // Ensure chart canvas has proper dimensions
        resizeChartCanvas();
        window.addEventListener('resize', resizeChartCanvas);
    }

    function resizeChartCanvas() {
        const container = chartCanvas.parentElement;
        chartCanvas.width = container.clientWidth;
        chartCanvas.height = container.clientHeight;
        if (currentChart) {
            currentChart.resize();
        }
    }

    function setupEventListeners() {
        fileInput.addEventListener('change', handleFileUpload);
        confirmMappingBtn.addEventListener('click', confirmColumnMapping);
        analysisType.addEventListener('change', handleAnalysisTypeChange);
        runAnalysisBtn.addEventListener('click', runAnalysis);
        generateChartBtn.addEventListener('click', generateChart);
        tabButtons.forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
        exportBtn.addEventListener('click', exportData);
        exportChartBtn.addEventListener('click', exportChartAsImage);
        resetBtn.addEventListener('click', resetApplication);
        homeBtn.addEventListener('click', goHome);
        
        // Add PDF export button
        const pdfExportBtn = document.createElement('button');
        pdfExportBtn.id = 'exportPdfBtn';
        pdfExportBtn.className = 'export-btn';
        pdfExportBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Export PDF';
        pdfExportBtn.addEventListener('click', exportToPDF);
        document.querySelector('.chart-actions').appendChild(pdfExportBtn);
    }

    function handleFileUpload(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        fileInfo.textContent = `${files.length} file(s) selected: ${Array.from(files).map(f => f.name).join(', ')}`;

        const fileReaders = Array.from(files).map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });
                        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                        resolve(jsonData);
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            });
        });

        Promise.all(fileReaders)
            .then(results => {
                const allHeaders = results.map(data => data[0]);
                const allRows = results.flatMap(data => data.slice(1));
                uploadedRows = allRows;
                detectColumnHeaders(allHeaders, allRows);
            })
            .catch(error => {
                showMessage('Error reading file(s): ' + error.message, 'error');
                console.error('File read error:', error);
            });
    }

    function detectColumnHeaders(headersArrays, allRows) {
        const possibleColumns = {
            description: ['description', 'item', 'product', 'name', 'product description'],
            quantity: ['quantity', 'qty', 'number sold', 'units sold', 'count'],
            sales: ['sales', 'total sales', 'revenue', 'net sales', 'total revenue', 'amount'],
            cost: ['cost', 'unit cost', 'cost price', 'cost per unit', 'purchase price']
        };

        const foundColumns = {};
        const referenceHeaders = headersArrays[0].map(h => h ? h.toString().toLowerCase().trim() : '');

        Object.keys(possibleColumns).forEach(colType => {
            let bestMatchIndex = -1;
            let bestMatchScore = 0;

            referenceHeaders.forEach((header, index) => {
                possibleColumns[colType].forEach(possibleName => {
                    const score = similarity(header, possibleName);
                    if (score > bestMatchScore && score > 0.6) {
                        bestMatchScore = score;
                        bestMatchIndex = index;
                    }
                });
            });

            if (bestMatchIndex >= 0) {
                foundColumns[colType] = bestMatchIndex;
            }
        });

        if (!foundColumns.description || !foundColumns.quantity || !foundColumns.sales) {
            showColumnMappingDialog(referenceHeaders);
        } else {
            mappedColumns = foundColumns;
            processUploadedData(allRows);
        }
    }

    function showColumnMappingDialog(headers) {
        mappingFields.innerHTML = '';
        const requiredFields = [
            { id: 'description', label: 'Product Description', required: true },
            { id: 'quantity', label: 'Quantity', required: true },
            { id: 'sales', label: 'Total Sales', required: true },
            { id: 'cost', label: 'Cost (if available)', required: false }
        ];

        requiredFields.forEach(field => {
            const row = document.createElement('div');
            row.className = 'mapping-row';
            const label = document.createElement('label');
            label.textContent = field.label;
            label.htmlFor = `map-${field.id}`;
            const select = document.createElement('select');
            select.id = `map-${field.id}`;
            select.className = 'mapping-select';
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = field.required ? '-- Select --' : 'Not available';
            select.appendChild(emptyOption);
            headers.forEach((header, index) => {
                if (header) {
                    const option = document.createElement('option');
                    option.value = index;
                    option.textContent = header;
                    select.appendChild(option);
                }
            });
            row.appendChild(label);
            row.appendChild(select);
            mappingFields.appendChild(row);
        });

        columnMapping.style.display = 'flex';
    }

    function confirmColumnMapping() {
        mappedColumns = {
            description: parseInt(document.getElementById('map-description').value),
            quantity: parseInt(document.getElementById('map-quantity').value),
            sales: parseInt(document.getElementById('map-sales').value),
            cost: document.getElementById('map-cost').value ? parseInt(document.getElementById('map-cost').value) : null
        };

        if (isNaN(mappedColumns.description) || isNaN(mappedColumns.quantity) || isNaN(mappedColumns.sales)) {
            showMessage('Please complete all required mappings', 'error');
            return;
        }

        columnMapping.style.display = 'none';
        processUploadedData(uploadedRows);
    }

    function processUploadedData(allRows) {
        const productMap = new Map();
        (allRows || []).forEach(row => {
            if (!row || row.length === 0) return;
            const description = row[mappedColumns.description]?.toString().trim();
            const quantity = parseFloat(row[mappedColumns.quantity]) || 0;
            const sales = parseFloat(row[mappedColumns.sales]) || 0;
            const cost = mappedColumns.cost !== null ? parseFloat(row[mappedColumns.cost]) || 0 : null;
            if (!description) return;

            let productKey = [...productMap.keys()].find(k => similarity(description, k) > 0.8) || description;

            if (productMap.has(productKey)) {
                const item = productMap.get(productKey);
                item.quantity += quantity;
                item.sales += sales;
                if (cost !== null) {
                    item.cost += cost;
                    item.profit = item.sales - item.cost;
                    item.unitPrice = item.sales / item.quantity;
                }
            } else {
                productMap.set(productKey, {
                    description: productKey,
                    quantity,
                    sales,
                    cost: cost !== null ? cost : undefined,
                    profit: cost !== null ? sales - cost : undefined,
                    unitPrice: quantity > 0 ? sales / quantity : 0
                });
            }
        });
        uploadedData = Array.from(productMap.values());
        showMessage('Data uploaded and processed successfully!', 'success');
    }

    function handleAnalysisTypeChange() {
        const selected = analysisType.value;
        analysisParams.innerHTML = '';
        if (['fastMoving', 'slowMoving'].includes(selected)) {
            analysisParams.innerHTML = `
                <div class="analysis-params">
                    <label for="itemCount">Number of Items:</label>
                    <input type="number" id="itemCount" min="1" value="10" class="param-input">
                </div>
            `;
        }
    }

    function runAnalysis() {
        if (uploadedData.length === 0) return showMessage('Please upload and map data first', 'error');
        const type = analysisType.value;
        if (!type) return showMessage('Please select an analysis type', 'error');

        let data = [...uploadedData];

        if (type === 'fastMoving') {
            const count = parseInt(document.getElementById('itemCount')?.value) || 10;
            data.sort((a, b) => b.quantity - a.quantity);
            data = data.slice(0, count);
        } else if (type === 'slowMoving') {
            const count = parseInt(document.getElementById('itemCount')?.value) || 10;
            data.sort((a, b) => a.quantity - b.quantity);
            data = data.slice(0, count);
        } else if (type === 'contribution') {
            const total = data.reduce((sum, d) => sum + d.sales, 0);
            data.forEach(d => d.contribution = total ? (d.sales / total) * 100 : 0);
            data.sort((a, b) => b.contribution - a.contribution);
        } else if (type === 'profitability') {
            if (mappedColumns.cost === null) return showMessage('Profitability analysis requires cost data', 'error');
            data.forEach(d => {
                d.profit = d.sales - (d.cost || 0);
                d.profitMargin = d.sales > 0 ? (d.profit / d.sales) * 100 : 0;
            });
            data.sort((a, b) => b.profit - a.profit);
        }

        currentReportData = data;
        displayReportData(data, type);
        showMessage('Analysis completed successfully!', 'success');
    }

    function displayReportData(data, type) {
        resultsTable.innerHTML = '';
        data.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.description}</td>
                <td>${formatNumber(item.quantity)}</td>
                <td>${formatNumber(item.sales)}</td>
                <td>${item.quantity > 0 ? formatNumber(item.sales / item.quantity) : 'N/A'}</td>
                <td>${
                    type === 'profitability' ? formatNumber(item.profit) :
                    type === 'contribution' ? `${item.contribution.toFixed(2)}%` :
                    formatNumber(item.profit ?? 0)
                }</td>
            `;
            resultsTable.appendChild(row);
        });
        switchTab('tableResults');
    }

    function generateChart() {
        if (currentReportData.length === 0) return showMessage('Please run an analysis first', 'error');
        if (!chartType.value) return showMessage('Please select a chart type', 'error');
        if (currentChart) currentChart.destroy();

        const ctx = chartCanvas.getContext('2d');
        const labels = currentReportData.map(i => i.description);
        const data = currentReportData.map(i =>
            analysisType.value === 'contribution' ? i.contribution :
            analysisType.value === 'profitability' ? i.profit :
            ['fastMoving', 'slowMoving'].includes(analysisType.value) ? i.quantity :
            i.sales
        );
        const label = analysisType.options[analysisType.selectedIndex].text;
        const bgColors = generateColors(labels.length);

        currentChart = new Chart(ctx, {
            type: chartType.value,
            data: {
                labels,
                datasets: [{
                    label,
                    data,
                    backgroundColor: bgColors,
                    borderColor: bgColors.map(c => c.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'right',
                        labels: {
                            boxWidth: 20,
                            padding: 20,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: context => {
                                let value = context.parsed.y;
                                let suffix = analysisType.value === 'contribution' ? '%' : '';
                                return `${context.dataset.label}: ${formatNumber(value)}${suffix}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                if (value >= 1000000) {
                                    return (value / 1000000).toFixed(1) + 'M';
                                } else if (value >= 1000) {
                                    return (value / 1000).toFixed(1) + 'K';
                                }
                                return value;
                            },
                            font: {
                                size: 10
                            }
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                size: 10
                            }
                        }
                    }
                }
            }
        });

        switchTab('chartResults');
    }

    function exportData() {
        if (currentReportData.length === 0) {
            showMessage('No data to export', 'error');
            return;
        }

        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(currentReportData.map(item => ({
                'Product': item.description,
                'Quantity': item.quantity,
                'Total Sales': item.sales,
                'Unit Price': item.unitPrice,
                'Profit': item.profit || 0,
                ...(analysisType.value === 'contribution' && {'Contribution (%)': item.contribution}),
                ...(analysisType.value === 'profitability' && {'Profit Margin (%)': item.profitMargin})
            })));
            
            XLSX.utils.book_append_sheet(wb, ws, "Analysis Results");
            XLSX.writeFile(wb, `Product_Analysis_${new Date().toISOString().slice(0,10)}.xlsx`);
            showMessage('Data exported successfully!', 'success');
        } catch (error) {
            showMessage('Error exporting data: ' + error.message, 'error');
            console.error('Export error:', error);
        }
    }

    function exportChartAsImage() {
        if (!currentChart) {
            showMessage('No chart to export', 'error');
            return;
        }

        try {
            const link = document.createElement('a');
            link.download = `Product_Chart_${new Date().toISOString().slice(0,10)}.png`;
            link.href = chartCanvas.toDataURL('image/png');
            link.click();
            showMessage('Chart exported as image!', 'success');
        } catch (error) {
            showMessage('Error exporting chart: ' + error.message, 'error');
            console.error('Chart export error:', error);
        }
    }

    function exportToPDF() {
        if (currentReportData.length === 0) {
            showMessage('No data to export', 'error');
            return;
        }

        try {
            const element = document.createElement('div');
            element.style.padding = '20px';
            
            // Add title
            const title = document.createElement('h1');
            title.textContent = `Product Analysis Report - ${analysisType.options[analysisType.selectedIndex].text}`;
            title.style.textAlign = 'center';
            title.style.marginBottom = '20px';
            element.appendChild(title);
            
            // Add date
            const date = document.createElement('p');
            date.textContent = `Generated on: ${new Date().toLocaleString()}`;
            date.style.textAlign = 'center';
            date.style.marginBottom = '20px';
            element.appendChild(date);
            
            // Create table
            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            
            // Table header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            [
                'Product',
                'Quantity',
                'Total Sales',
                'Unit Price',
                analysisType.value === 'contribution' ? 'Contribution (%)' : 
                analysisType.value === 'profitability' ? 'Profit Margin (%)' : 'Profit'
            ].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                th.style.border = '1px solid #000';
                th.style.padding = '8px';
                th.style.backgroundColor = '#2c3e50';
                th.style.color = '#fff';
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);
            
            // Table body
            const tbody = document.createElement('tbody');
            currentReportData.forEach(item => {
                const row = document.createElement('tr');
                [
                    item.description,
                    formatNumber(item.quantity),
                    formatNumber(item.sales),
                    item.quantity > 0 ? formatNumber(item.sales / item.quantity) : 'N/A',
                    analysisType.value === 'contribution' ? `${item.contribution.toFixed(2)}%` :
                    analysisType.value === 'profitability' ? `${item.profitMargin.toFixed(2)}%` :
                    formatNumber(item.profit ?? 0)
                ].forEach(text => {
                    const td = document.createElement('td');
                    td.textContent = text;
                    td.style.border = '1px solid #ddd';
                    td.style.padding = '8px';
                    row.appendChild(td);
                });
                row.style.backgroundColor = '#f9f9f9';
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            element.appendChild(table);
            
            // Add chart if available
            if (currentChart) {
                const chartTitle = document.createElement('h2');
                chartTitle.textContent = 'Chart Visualization';
                chartTitle.style.marginTop = '30px';
                chartTitle.style.textAlign = 'center';
                element.appendChild(chartTitle);
                
                const chartImg = document.createElement('img');
                chartImg.src = chartCanvas.toDataURL('image/png');
                chartImg.style.maxWidth = '100%';
                chartImg.style.margin = '0 auto';
                chartImg.style.display = 'block';
                element.appendChild(chartImg);
            }
            
            // Generate PDF
            const opt = {
                margin: 10,
                filename: `Product_Analysis_${new Date().toISOString().slice(0,10)}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            
            html2pdf().set(opt).from(element).save().then(() => {
                showMessage('PDF exported successfully!', 'success');
            });
        } catch (error) {
            showMessage('Error exporting PDF: ' + error.message, 'error');
            console.error('PDF export error:', error);
        }
    }

    function switchTab(tabId) {
        tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        resultsSections.forEach(sec => sec.classList.toggle('active', sec.id === tabId));
        
        // Resize chart when tab becomes active
        if (tabId === 'chartResults' && currentChart) {
            setTimeout(() => {
                currentChart.resize();
            }, 100);
        }
    }

    function resetApplication() {
        fileInput.value = '';
        fileInfo.textContent = '';
        columnMapping.style.display = 'none';
        mappingFields.innerHTML = '';
        mappedColumns = {};
        uploadedData = [];
        uploadedRows = [];
        currentReportData = [];
        chartType.value = '';
        
        // Clear the chart
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }
        const ctx = chartCanvas.getContext('2d');
        ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
        
        analysisType.value = '';
        analysisParams.innerHTML = '';
        resultsTable.innerHTML = '';
        switchTab('tableResults');
        messageArea.style.display = 'none';
        
        showMessage('Application has been reset', 'success');
    }

    function goHome() {
        resetApplication();
    }

    function showMessage(msg, type) {
        messageArea.textContent = msg;
        messageArea.className = `message-area ${type}`;
        messageArea.style.display = 'block';
        
        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                messageArea.style.display = 'none';
            }, 5000);
        }
    }

    function formatNumber(num) {
        return isNaN(num) ? '0' : Number(num).toLocaleString(undefined, { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
    }

    function generateColors(count) {
        const colors = [];
        const step = 360 / count;
        for (let i = 0; i < count; i++) {
            colors.push(`hsla(${i * step}, 70%, 50%, 0.7)`);
        }
        return colors;
    }

    function similarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0) return 1.0;
        const dist = levenshteinDistance(longer, shorter);
        return (longer.length - dist) / parseFloat(longer.length);
    }

    function levenshteinDistance(s, t) {
        if (s === t) return 0;
        if (s.length === 0) return t.length;
        if (t.length === 0) return s.length;

        const v0 = new Array(t.length + 1).fill(0).map((_, i) => i);
        const v1 = new Array(t.length + 1);

        for (let i = 0; i < s.length; i++) {
            v1[0] = i + 1;
            for (let j = 0; j < t.length; j++) {
                const cost = s[i] === t[j] ? 0 : 1;
                v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
            }
            for (let j = 0; j < v0.length; j++) v0[j] = v1[j];
        }

        return v1[t.length];
    }
});
