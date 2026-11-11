// controllers/kpi.analytics.controller.js
const { KPIScore } = require("../models/KPIScore.model");
const { KPIWeight } = require("../models/KPIWeight.model");
const { User } = require("../models/User.model");
const { Department } = require("../models/Department.model");
const { Task } = require("../models/Task.model");
const mongoose = require("mongoose");

// ============================================================
// AI-POWERED INSIGHTS
// ============================================================
const getAIInsights = async (req, res) => {
  try {
    const { departmentId, month, year } = req.query;
    const user = req.user;

    const monthIndex = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    const monthStr = `${yearNum}-${String(monthIndex).padStart(2, "0")}`;

    console.log(`🔍 Fetching AI Insights for: ${monthStr}, department: ${departmentId || 'all'}`);

    // Build query
    let query = { month: monthStr, year: yearNum };
    if (departmentId && departmentId !== "all") {
      query.departmentId = departmentId;
    }

    // Get scores - try multiple approaches
    let scores = await KPIScore.find(query)
      .populate("userId", "fullName email employeeId role")
      .populate("departmentId", "name code")
      .lean();

    console.log(`📊 Found ${scores.length} scores with month filter`);

    // If no scores found, try fallback with date range
    if (scores.length === 0) {
      console.log("⚠️ No scores found with month filter, trying date range...");

      const startDate = new Date(yearNum, monthIndex - 1, 1);
      const endDate = new Date(yearNum, monthIndex, 0, 23, 59, 59, 999);

      const fallbackScores = await KPIScore.find({
        calculatedAt: { $gte: startDate, $lte: endDate },
        ...(departmentId && departmentId !== "all" ? { departmentId } : {})
      })
        .populate("userId", "fullName email employeeId role")
        .populate("departmentId", "name code")
        .lean();

      if (fallbackScores.length > 0) {
        console.log(`✅ Found ${fallbackScores.length} scores using date range`);
        scores = fallbackScores;
      }
    }

    // If still no scores, try to get all scores for the year
    if (scores.length === 0) {
      console.log("⚠️ No scores found, trying to get all scores for the year...");

      const yearScores = await KPIScore.find({
        year: yearNum,
        ...(departmentId && departmentId !== "all" ? { departmentId } : {})
      })
        .populate("userId", "fullName email employeeId role")
        .populate("departmentId", "name code")
        .lean();

      if (yearScores.length > 0) {
        console.log(`✅ Found ${yearScores.length} scores for the year, filtering by month...`);
        // Filter scores that match the month
        scores = yearScores.filter(s => {
          const sMonth = parseInt(s.month.split('-')[1]);
          return sMonth === monthIndex;
        });
        console.log(`📊 After month filtering: ${scores.length} scores`);
      }
    }

    // If still no scores, return empty state with sample data for testing
    if (scores.length === 0) {
      console.log("❌ No KPI scores found, returning empty state");

      // Generate sample insights for demo
      const sampleInsights = generateSampleInsights();

      return res.json({
        success: true,
        data: {
          insights: sampleInsights,
          predictions: generateSamplePredictions(),
          recommendations: generateSampleRecommendations(),
          anomalies: [],
          summary: {
            totalEmployees: 0,
            averageScore: 0,
            maxScore: 0,
            minScore: 0,
            stdDev: 0,
            distribution: {
              excellent: 0,
              good: 0,
              average: 0,
              needs_improvement: 0,
            },
          },
          departmentStats: [],
          _debug: {
            message: "No KPI data found. Please calculate KPI scores first.",
            query: query,
            monthStr: monthStr,
            yearNum: yearNum,
            monthIndex: monthIndex
          }
        },
      });
    }

    // Calculate statistics
    const total = scores.length;
    const avgScore = scores.reduce((sum, s) => sum + (s.totalScore || 0), 0) / total;
    const maxScore = Math.max(...scores.map((s) => s.totalScore || 0));
    const minScore = Math.min(...scores.map((s) => s.totalScore || 0));
    const stdDev = calculateStdDev(scores.map((s) => s.totalScore || 0));

    // Department comparisons
    const deptMap = new Map();
    scores.forEach((s) => {
      const deptId = s.departmentId?._id?.toString() || "unknown";
      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, {
          name: s.departmentId?.name || "Unknown",
          scores: [],
          total: 0,
          count: 0,
        });
      }
      const dept = deptMap.get(deptId);
      dept.scores.push(s.totalScore || 0);
      dept.total += s.totalScore || 0;
      dept.count++;
    });

    const deptStats = Array.from(deptMap.entries()).map(function (item) {
      const id = item[0];
      const data = item[1];
      return {
        departmentId: id,
        departmentName: data.name,
        averageScore: data.count > 0 ? Math.round(data.total / data.count) : 0,
        employeeCount: data.count,
        minScore: data.scores.length > 0 ? Math.min.apply(null, data.scores) : 0,
        maxScore: data.scores.length > 0 ? Math.max.apply(null, data.scores) : 0,
        stdDev: calculateStdDev(data.scores),
      };
    });

    // Generate Insights
    const insights = generateInsights(
      scores,
      avgScore,
      maxScore,
      minScore,
      stdDev,
      deptStats,
    );

    // Generate Predictions
    const predictions = await generatePredictions(scores, departmentId);

    // Generate Recommendations
    const recommendations = generateRecommendations(
      scores,
      avgScore,
      deptStats,
    );

    // Detect Anomalies
    const anomalies = detectAnomalies(scores, avgScore, stdDev);

    res.json({
      success: true,
      data: {
        insights: insights,
        predictions: predictions,
        recommendations: recommendations,
        anomalies: anomalies,
        summary: {
          totalEmployees: total,
          averageScore: Math.round(avgScore),
          maxScore: Math.round(maxScore),
          minScore: Math.round(minScore),
          stdDev: Math.round(stdDev * 100) / 100,
          distribution: {
            excellent: scores.filter(function (s) {
              return s.performanceLevel === "excellent";
            }).length,
            good: scores.filter(function (s) {
              return s.performanceLevel === "good";
            }).length,
            average: scores.filter(function (s) {
              return s.performanceLevel === "average";
            }).length,
            needs_improvement: scores.filter(function (s) {
              return s.performanceLevel === "needs_improvement";
            }).length,
          },
        },
        departmentStats: deptStats,
      },
    });
  } catch (error) {
    console.error("Get AI insights error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// PERFORMANCE PREDICTIONS
// ============================================================
const getPerformancePredictions = async (req, res) => {
  try {
    const { departmentId, months = 6 } = req.query;
    const user = req.user;

    // Get historical data
    let query = {};
    if (departmentId && departmentId !== "all") {
      query.departmentId = departmentId;
    }

    const historicalScores = await KPIScore.find(query)
      .sort({ year: 1, month: 1 })
      .lean();

    if (historicalScores.length === 0) {
      return res.json({
        success: true,
        data: {
          predictions: generateSamplePredictions(),
          trend: "stable",
          confidence: 0.5,
          message: "No historical data available. Showing sample predictions.",
        },
      });
    }

    // Group by month
    const monthData = new Map();
    historicalScores.forEach(function (s) {
      const key = s.year + "-" + s.month;
      if (!monthData.has(key)) {
        monthData.set(key, { scores: [], month: s.month, year: s.year });
      }
      monthData.get(key).scores.push(s.totalScore);
    });

    // Calculate monthly averages
    const monthlyAverages = Array.from(monthData.entries())
      .map(function (item) {
        const key = item[0];
        const data = item[1];
        return {
          month: data.month,
          year: data.year,
          average:
            data.scores.reduce(function (sum, s) {
              return sum + s;
            }, 0) / data.scores.length,
          count: data.scores.length,
        };
      })
      .sort(function (a, b) {
        return a.year - b.year || a.month - b.month;
      });

    // Simple linear regression for prediction
    const predictions = predictFutureScores(monthlyAverages, parseInt(months));

    // Determine trend
    const trend = determineTrend(monthlyAverages);

    // Calculate confidence
    const confidence = calculateConfidence(monthlyAverages);

    res.json({
      success: true,
      data: {
        predictions: predictions,
        trend: trend,
        confidence: confidence,
        historicalData: monthlyAverages,
      },
    });
  } catch (error) {
    console.error("Get performance predictions error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// DEPARTMENT COMPARISONS
// ============================================================
const getDepartmentComparisons = async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthIndex = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    const monthStr = yearNum + "-" + String(monthIndex).padStart(2, "0");

    console.log(`🔍 Fetching department comparisons for: ${monthStr}`);

    // Get all departments
    const departments = await Department.find({ isActive: true }).lean();

    if (departments.length === 0) {
      return res.json({
        success: true,
        data: {
          departments: [],
          overall: { totalEmployees: 0, averageScore: 0 },
          message: "No departments found",
        },
      });
    }

    // Get scores for each department
    const deptComparisons = await Promise.all(
      departments.map(async function (dept) {
        const scores = await KPIScore.find({
          departmentId: dept._id,
          month: monthStr,
          year: yearNum,
        })
          .populate("userId", "fullName email")
          .lean();

        const total = scores.length;
        const avg =
          total > 0
            ? scores.reduce(function (sum, s) {
              return sum + (s.totalScore || 0);
            }, 0) / total
            : 0;
        const max =
          total > 0
            ? Math.max.apply(
              null,
              scores.map(function (s) {
                return s.totalScore || 0;
              }),
            )
            : 0;
        const min =
          total > 0
            ? Math.min.apply(
              null,
              scores.map(function (s) {
                return s.totalScore || 0;
              }),
            )
            : 0;

        // Component averages
        const components = {
          taskCompletion:
            total > 0
              ? scores.reduce(function (sum, s) {
                return sum + (s.scores?.taskCompletion?.score || 0);
              }, 0) / total
              : 0,
          qualityScore:
            total > 0
              ? scores.reduce(function (sum, s) {
                return sum + (s.scores?.qualityScore?.score || 0);
              }, 0) / total
              : 0,
          efficiency:
            total > 0
              ? scores.reduce(function (sum, s) {
                return sum + (s.scores?.efficiency?.score || 0);
              }, 0) / total
              : 0,
          collaboration:
            total > 0
              ? scores.reduce(function (sum, s) {
                return sum + (s.scores?.collaboration?.score || 0);
              }, 0) / total
              : 0,
          innovation:
            total > 0
              ? scores.reduce(function (sum, s) {
                return sum + (s.scores?.innovation?.score || 0);
              }, 0) / total
              : 0,
          attendance:
            total > 0
              ? scores.reduce(function (sum, s) {
                return sum + (s.scores?.attendance?.score || 0);
              }, 0) / total
              : 0,
        };

        // Performance distribution
        const distribution = {
          excellent: scores.filter(function (s) {
            return s.performanceLevel === "excellent";
          }).length,
          good: scores.filter(function (s) {
            return s.performanceLevel === "good";
          }).length,
          average: scores.filter(function (s) {
            return s.performanceLevel === "average";
          }).length,
          needs_improvement: scores.filter(function (s) {
            return s.performanceLevel === "needs_improvement";
          }).length,
        };

        return {
          departmentId: dept._id,
          departmentName: dept.name,
          departmentCode: dept.code,
          totalEmployees: total,
          averageScore: Math.round(avg),
          maxScore: Math.round(max),
          minScore: Math.round(min),
          components: {
            taskCompletion: Math.round(components.taskCompletion),
            qualityScore: Math.round(components.qualityScore),
            efficiency: Math.round(components.efficiency),
            collaboration: Math.round(components.collaboration),
            innovation: Math.round(components.innovation),
            attendance: Math.round(components.attendance),
          },
          distribution: distribution,
        };
      }),
    );

    // Calculate overall stats
    const overall = {
      totalEmployees: deptComparisons.reduce(function (sum, d) {
        return sum + d.totalEmployees;
      }, 0),
      averageScore:
        deptComparisons.length > 0
          ? Math.round(
            deptComparisons.reduce(function (sum, d) {
              return sum + d.averageScore;
            }, 0) / deptComparisons.length,
          )
          : 0,
    };

    res.json({
      success: true,
      data: {
        departments: deptComparisons,
        overall: overall,
      },
    });
  } catch (error) {
    console.error("Get department comparisons error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// HEAT MAP DATA
// ============================================================
const getHeatMapData = async (req, res) => {
  try {
    const { departmentId, month, year } = req.query;
    const monthIndex = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    const monthStr = yearNum + "-" + String(monthIndex).padStart(2, "0");

    let query = { month: monthStr, year: yearNum };
    if (departmentId && departmentId !== "all") {
      query.departmentId = departmentId;
    }

    const scores = await KPIScore.find(query)
      .populate("userId", "fullName email employeeId")
      .populate("departmentId", "name code")
      .lean();

    // If no scores, return empty with message
    if (scores.length === 0) {
      return res.json({
        success: true,
        data: {
          heatMapData: [],
          ranges: {
            taskCompletion: { min: 0, max: 100 },
            qualityScore: { min: 0, max: 100 },
            efficiency: { min: 0, max: 100 },
            collaboration: { min: 0, max: 100 },
            innovation: { min: 0, max: 100 },
            attendance: { min: 0, max: 100 },
          },
          summary: {
            totalEmployees: 0,
            averageTotalScore: 0,
          },
          message: "No heat map data available for the selected period.",
        },
      });
    }

    // Generate heat map data
    const heatMapData = scores.map(function (score) {
      return {
        employeeId: score.userId?._id || 'unknown',
        employeeName: score.userId?.fullName || 'Unknown',
        department: score.departmentId?.name || "Unknown",
        taskCompletion: score.scores?.taskCompletion?.score || 0,
        qualityScore: score.scores?.qualityScore?.score || 0,
        efficiency: score.scores?.efficiency?.score || 0,
        collaboration: score.scores?.collaboration?.score || 0,
        innovation: score.scores?.innovation?.score || 0,
        attendance: score.scores?.attendance?.score || 0,
        totalScore: score.totalScore || 0,
        performanceLevel: score.performanceLevel || 'average',
      };
    });

    // Calculate component ranges for normalization
    const ranges = {
      taskCompletion: { min: 0, max: 100 },
      qualityScore: { min: 0, max: 100 },
      efficiency: { min: 0, max: 100 },
      collaboration: { min: 0, max: 100 },
      innovation: { min: 0, max: 100 },
      attendance: { min: 0, max: 100 },
    };

    res.json({
      success: true,
      data: {
        heatMapData: heatMapData,
        ranges: ranges,
        summary: {
          totalEmployees: scores.length,
          averageTotalScore:
            scores.length > 0
              ? Math.round(
                scores.reduce(function (sum, s) {
                  return sum + (s.totalScore || 0);
                }, 0) / scores.length,
              )
              : 0,
        },
      },
    });
  } catch (error) {
    console.error("Get heat map data error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error: " + error.message });
  }
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function calculateStdDev(values) {
  if (values.length === 0) return 0;
  const validValues = values.filter(v => v !== undefined && v !== null);
  if (validValues.length === 0) return 0;

  var avg =
    validValues.reduce(function (sum, v) {
      return sum + v;
    }, 0) / validValues.length;
  var squareDiffs = validValues.map(function (v) {
    return Math.pow(v - avg, 2);
  });
  return Math.sqrt(
    squareDiffs.reduce(function (sum, v) {
      return sum + v;
    }, 0) / validValues.length,
  );
}

function generateInsights(
  scores,
  avgScore,
  maxScore,
  minScore,
  stdDev,
  deptStats,
) {
  var insights = [];

  // Overall performance insight
  if (avgScore >= 80) {
    insights.push({
      type: "success",
      title: "Strong Overall Performance",
      description:
        "The average score of " +
        Math.round(avgScore) +
        "% indicates strong performance across the organization.",
      impact: "high",
    });
  } else if (avgScore >= 60) {
    insights.push({
      type: "warning",
      title: "Moderate Performance Level",
      description:
        "The average score of " +
        Math.round(avgScore) +
        "% suggests room for improvement in key areas.",
      impact: "medium",
    });
  } else if (avgScore > 0) {
    insights.push({
      type: "danger",
      title: "Performance Improvement Needed",
      description:
        "The average score of " +
        Math.round(avgScore) +
        "% indicates significant performance gaps that need attention.",
      impact: "high",
    });
  }

  // Top performer insight
  if (maxScore > 0) {
    var topPerformer = scores.find(function (s) {
      return s.totalScore === maxScore;
    });
    insights.push({
      type: "success",
      title: "Top Performer Identified",
      description:
        (topPerformer?.userId?.fullName || "An employee") +
        " achieved the highest score of " +
        Math.round(maxScore) +
        "%",
      impact: "medium",
    });
  }

  // Low performer insight
  if (minScore < 40 && minScore > 0) {
    var lowPerformer = scores.find(function (s) {
      return s.totalScore === minScore;
    });
    insights.push({
      type: "danger",
      title: "Performance Alert",
      description:
        (lowPerformer?.userId?.fullName || "An employee") +
        " has a score of " +
        Math.round(minScore) +
        "% - below the target threshold.",
      impact: "high",
    });
  }

  // Consistency insight
  if (stdDev < 10 && stdDev > 0) {
    insights.push({
      type: "info",
      title: "Consistent Performance",
      description:
        "Low variability in scores indicates consistent performance across the team.",
      impact: "low",
    });
  } else if (stdDev > 20) {
    insights.push({
      type: "warning",
      title: "Performance Variance",
      description:
        "High variability in scores suggests inconsistent performance that may need standardization.",
      impact: "medium",
    });
  }

  // Department comparison insight
  if (deptStats.length > 1) {
    var sorted = [...deptStats].sort(function (a, b) {
      return b.averageScore - a.averageScore;
    });
    var best = sorted[0];
    var worst = sorted[sorted.length - 1];
    if (best && worst && best.averageScore - worst.averageScore > 10) {
      insights.push({
        type: "info",
        title: "Department Performance Gap",
        description:
          best.departmentName +
          " (" +
          best.averageScore +
          "%) outperforms " +
          worst.departmentName +
          " (" +
          worst.averageScore +
          "%) by " +
          (best.averageScore - worst.averageScore) +
          "%",
        impact: "medium",
      });
    }
  }

  // If no insights were generated, add a default one
  if (insights.length === 0 && scores.length > 0) {
    insights.push({
      type: "info",
      title: "Data Available",
      description: `${scores.length} KPI records found for the selected period.`,
      impact: "low",
    });
  }

  return insights;
}

function generatePredictions(scores, departmentId) {
  return new Promise(function (resolve) {
    try {
      // If no scores, return sample predictions
      if (!scores || scores.length === 0) {
        resolve(generateSamplePredictions());
        return;
      }

      // Simple moving average prediction
      var lastMonth = scores.slice(-3);
      var avgScore =
        lastMonth.reduce(function (sum, s) {
          return sum + (s.totalScore || 0);
        }, 0) / (lastMonth.length || 1);

      var trend = 0;
      if (scores.length > 1) {
        trend = scores.slice(-6).reduce(function (sum, s, i, arr) {
          if (i === 0) return 0;
          return sum + ((s.totalScore || 0) - (arr[i - 1]?.totalScore || 0));
        }, 0) / (scores.length - 1);
      }

      var predictions = [];
      var months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      var nextMonth = new Date().getMonth() + 1;

      for (var i = 0; i < 6; i++) {
        var predicted = Math.max(0, Math.min(100, avgScore + trend * (i + 1)));
        var monthIdx = (nextMonth + i) % 12;
        predictions.push({
          month: months[monthIdx],
          predictedScore: Math.round(predicted),
          confidence: predictions.length < 3 ? "medium" : "high",
          trend: trend > 2 ? "up" : trend < -2 ? "down" : "stable",
        });
      }

      resolve(predictions);
    } catch (error) {
      console.error("Generate predictions error:", error);
      resolve(generateSamplePredictions());
    }
  });
}

function generateSamplePredictions() {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const nextMonth = new Date().getMonth() + 1;
  const predictions = [];

  for (var i = 0; i < 6; i++) {
    const monthIdx = (nextMonth + i) % 12;
    const baseScore = 65 + Math.random() * 20;
    predictions.push({
      month: months[monthIdx],
      predictedScore: Math.round(baseScore + (i * 2)),
      confidence: i < 3 ? "medium" : "high",
      trend: i < 2 ? "up" : i < 4 ? "stable" : "up",
    });
  }

  return predictions;
}

function generateSampleInsights() {
  return [
    {
      type: "info",
      title: "No KPI Data Available",
      description: "Please calculate KPI scores for the selected period to see AI-powered insights.",
      impact: "medium"
    },
    {
      type: "warning",
      title: "Data Needed",
      description: "Generate KPI scores by calculating performance metrics for your employees.",
      impact: "medium"
    }
  ];
}

function generateSampleRecommendations() {
  return [
    {
      area: "Data Collection",
      title: "Calculate KPI Scores",
      description: "Start by calculating KPI scores for your employees to get personalized recommendations.",
      priority: "high",
      impact: "high"
    }
  ];
}

function generateRecommendations(scores, avgScore, deptStats) {
  var recommendations = [];

  // If no scores, return sample recommendations
  if (!scores || scores.length === 0) {
    return generateSampleRecommendations();
  }

  // Overall recommendations
  if (avgScore < 70) {
    recommendations.push({
      area: "Overall Performance",
      title: "Improve Overall Performance",
      description:
        "Focus on training and development programs to improve key performance areas.",
      priority: "high",
      impact: "high",
    });
  }

  // Component-specific recommendations
  var componentAverages = {
    taskCompletion:
      scores.reduce(function (sum, s) {
        return sum + (s.scores?.taskCompletion?.score || 0);
      }, 0) / scores.length,
    qualityScore:
      scores.reduce(function (sum, s) {
        return sum + (s.scores?.qualityScore?.score || 0);
      }, 0) / scores.length,
    efficiency:
      scores.reduce(function (sum, s) {
        return sum + (s.scores?.efficiency?.score || 0);
      }, 0) / scores.length,
    collaboration:
      scores.reduce(function (sum, s) {
        return sum + (s.scores?.collaboration?.score || 0);
      }, 0) / scores.length,
    innovation:
      scores.reduce(function (sum, s) {
        return sum + (s.scores?.innovation?.score || 0);
      }, 0) / scores.length,
    attendance:
      scores.reduce(function (sum, s) {
        return sum + (s.scores?.attendance?.score || 0);
      }, 0) / scores.length,
  };

  var componentNames = {
    taskCompletion: "Task Completion",
    qualityScore: "Quality Score",
    efficiency: "Efficiency",
    collaboration: "Collaboration",
    innovation: "Innovation",
    attendance: "Attendance",
  };

  Object.keys(componentAverages).forEach(function (key) {
    var value = componentAverages[key];
    if (value < 60 && value > 0) {
      recommendations.push({
        area: componentNames[key] || key,
        title: "Improve " + (componentNames[key] || key),
        description:
          "Current " +
          (componentNames[key] || key) +
          " score is " +
          Math.round(value) +
          "%. Implement targeted improvement strategies.",
        priority: value < 40 ? "high" : "medium",
        impact: "medium",
      });
    }
  });

  // Department recommendations
  if (deptStats && deptStats.length > 1) {
    var sorted = [...deptStats].sort(function (a, b) {
      return b.averageScore - a.averageScore;
    });
    var worst = sorted[sorted.length - 1];
    if (worst && worst.averageScore < 60 && worst.averageScore > 0) {
      recommendations.push({
        area: "Department Performance",
        title: "Support " + worst.departmentName,
        description:
          worst.departmentName +
          " (" +
          worst.averageScore +
          "%) needs additional support and resources to improve performance.",
        priority: "high",
        impact: "high",
      });
    }
  }

  return recommendations;
}

function detectAnomalies(scores, avgScore, stdDev) {
  var anomalies = [];
  var threshold = 2;

  // If no scores or stdDev is 0, return empty
  if (!scores || scores.length === 0 || stdDev === 0) {
    return anomalies;
  }

  scores.forEach(function (score) {
    var zScore = ((score.totalScore || 0) - avgScore) / stdDev;
    if (Math.abs(zScore) > threshold) {
      anomalies.push({
        employeeId: score.userId?._id || 'unknown',
        employeeName: score.userId?.fullName || 'Unknown',
        department: score.departmentId?.name || "Unknown",
        score: score.totalScore || 0,
        expectedScore: Math.round(avgScore),
        deviation: Math.round(zScore * 100) / 100,
        type: zScore > 0 ? "high_performer" : "low_performer",
        severity: Math.abs(zScore) > 3 ? "critical" : "high",
      });
    }
  });

  return anomalies;
}

function predictFutureScores(monthlyAverages, months) {
  if (!monthlyAverages || monthlyAverages.length < 2) {
    return generateSamplePredictions();
  }

  var predictions = [];
  var lastData = monthlyAverages[monthlyAverages.length - 1];
  var trend =
    (monthlyAverages[monthlyAverages.length - 1].average -
      monthlyAverages[0].average) /
    (monthlyAverages.length - 1 || 1);

  var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var nextMonth = new Date().getMonth() + 1;

  for (var i = 0; i < months; i++) {
    var predicted = Math.max(0, Math.min(100, Math.round(lastData.average + trend * (i + 1))));
    var monthIdx = (nextMonth + i) % 12;
    predictions.push({
      month: monthNames[monthIdx],
      predictedScore: predicted,
      confidence: i < 3 ? "medium" : "high",
      trend: trend > 2 ? "up" : trend < -2 ? "down" : "stable",
    });
  }

  return predictions;
}

function determineTrend(monthlyAverages) {
  if (!monthlyAverages || monthlyAverages.length < 2) return "stable";

  var first = monthlyAverages[0].average;
  var last = monthlyAverages[monthlyAverages.length - 1].average;
  if (first === 0) return "stable";

  var diff = last - first;
  var percentChange = (diff / first) * 100;

  if (percentChange > 5) return "up";
  if (percentChange < -5) return "down";
  return "stable";
}

function calculateConfidence(monthlyAverages) {
  if (!monthlyAverages || monthlyAverages.length < 3) return 0.3;
  if (monthlyAverages.length < 6) return 0.6;
  return 0.85;
}

// ============================================================
// DEBUG ENDPOINT - Check KPI data
// ============================================================
const debugKPIData = async (req, res) => {
  try {
    const { month, year } = req.query;

    // Get all KPI scores
    const allScores = await KPIScore.find({})
      .populate("userId", "fullName email")
      .populate("departmentId", "name code")
      .lean();

    // Group by month/year
    const grouped = {};
    allScores.forEach(s => {
      const key = `${s.year}-${s.month}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(s);
    });

    // Get count by month
    const monthCounts = Object.keys(grouped).map(key => ({
      month: key,
      count: grouped[key].length,
      sample: grouped[key].slice(0, 2).map(s => ({
        employee: s.userId?.fullName || 'Unknown',
        score: s.totalScore,
        department: s.departmentId?.name || 'Unknown'
      }))
    }));

    // Get total count
    const totalCount = allScores.length;

    res.json({
      success: true,
      data: {
        totalScores: totalCount,
        monthCounts: monthCounts,
        allMonths: Object.keys(grouped),
        sampleScores: allScores.slice(0, 5),
        queryExample: {
          month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
          year: new Date().getFullYear()
        },
        message: totalCount === 0 ? "No KPI scores found in database. Please calculate KPI scores first." : "KPI data found."
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// GENERATE SAMPLE DATA (for testing)
// ============================================================
const generateSampleKPIData = async (req, res) => {
  try {
    const { month, year } = req.query;
    const monthIndex = parseInt(month) || new Date().getMonth() + 1;
    const yearNum = parseInt(year) || new Date().getFullYear();
    const monthStr = `${yearNum}-${String(monthIndex).padStart(2, "0")}`;

    // Get users and departments
    const users = await User.find({ isActive: true }).limit(20);
    const departments = await Department.find({ isActive: true }).limit(5);

    if (users.length === 0 || departments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No users or departments found. Please create some first."
      });
    }

    const sampleScores = [];
    const scoreLevels = ['excellent', 'good', 'average', 'needs_improvement'];

    for (const user of users) {
      for (const dept of departments) {
        // Random score between 40-95
        const baseScore = 40 + Math.random() * 55;
        const totalScore = Math.round(baseScore);

        // Determine level
        let level;
        if (totalScore >= 90) level = 'excellent';
        else if (totalScore >= 75) level = 'good';
        else if (totalScore >= 60) level = 'average';
        else level = 'needs_improvement';

        const score = {
          userId: user._id,
          departmentId: dept._id,
          month: monthStr,
          year: yearNum,
          scores: {
            taskCompletion: {
              score: Math.round(50 + Math.random() * 45),
              weight: 20,
              weightedScore: 0
            },
            qualityScore: {
              score: Math.round(50 + Math.random() * 45),
              weight: 20,
              weightedScore: 0
            },
            efficiency: {
              score: Math.round(50 + Math.random() * 45),
              weight: 20,
              weightedScore: 0
            },
            collaboration: {
              score: Math.round(50 + Math.random() * 45),
              weight: 15,
              weightedScore: 0
            },
            innovation: {
              score: Math.round(50 + Math.random() * 45),
              weight: 15,
              weightedScore: 0
            },
            attendance: {
              score: Math.round(60 + Math.random() * 35),
              weight: 10,
              weightedScore: 0
            },
          },
          totalScore: totalScore,
          performanceLevel: level,
          calculatedBy: req.user?._id,
          comments: "Sample data generated for testing",
          calculatedAt: new Date()
        };

        // Calculate weighted scores
        Object.keys(score.scores).forEach(key => {
          const s = score.scores[key];
          s.weightedScore = Math.round((s.score * s.weight) / 100);
        });

        sampleScores.push(score);
      }
    }

    // Insert sample data
    await KPIScore.insertMany(sampleScores);

    res.json({
      success: true,
      message: `Generated ${sampleScores.length} sample KPI scores for ${monthStr}`,
      data: {
        count: sampleScores.length,
        month: monthStr,
        users: users.length,
        departments: departments.length
      }
    });
  } catch (error) {
    console.error("Generate sample data error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  getAIInsights,
  getPerformancePredictions,
  getDepartmentComparisons,
  getHeatMapData,
  debugKPIData,
  generateSampleKPIData,
};