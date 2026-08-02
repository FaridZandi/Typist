// Reaction history chart. Reaction time and accuracy lead; hit and error counts
// are available but hidden by default so the plot stays readable.

export function createReactionChart({ canvas, getChart }) {
  let chart = null;

  return {
    render(history) {
      const Chart = getChart();
      if (!Chart || !canvas) return;

      const series = (label, pick, borderColor, backgroundColor, axis, hidden = false) => ({
        label,
        data: history.map((run, index) => ({ x: index + 1, y: pick(run) })),
        borderColor,
        backgroundColor,
        tension: 0.25,
        parsing: false,
        yAxisID: axis,
        ...(hidden ? { hidden: true } : {}),
      });

      const data = {
        datasets: [
          series("Avg reaction (ms)", (run) => run.averageReaction, "#0f766e", "rgba(15, 118, 110, 0.12)", "milliseconds"),
          series("Accuracy (%)", (run) => run.accuracy, "#15803d", "rgba(21, 128, 61, 0.12)", "percent"),
          series("Hits", (run) => run.hits, "#4f5df3", "rgba(79, 93, 243, 0.12)", "count", true),
          series("Errors", (run) => run.errors, "#c62828", "rgba(198, 40, 40, 0.12)", "count", true),
        ],
      };

      if (chart) {
        chart.data = data;
        chart.update();
        return;
      }

      chart = new Chart(canvas, {
        type: "line",
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: { position: "bottom" },
            tooltip: {
              callbacks: {
                afterTitle(items) {
                  return new Date(history[items[0].dataIndex].completedAt).toLocaleString();
                },
              },
            },
          },
          scales: {
            x: { type: "linear", title: { display: true, text: "Test number" }, ticks: { stepSize: 1 } },
            milliseconds: { type: "linear", position: "left", beginAtZero: true, title: { display: true, text: "Milliseconds" } },
            percent: { type: "linear", position: "right", beginAtZero: true, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: "Accuracy" } },
            count: { type: "linear", position: "right", beginAtZero: true, display: false, grid: { drawOnChartArea: false } },
          },
        },
      });
    },
  };
}
