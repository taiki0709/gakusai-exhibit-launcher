// 迷路探索AI: 矢印キーで迷路を進む。H で AI (幅優先探索) の最短ルートを表示。N で新しい迷路、Esc で終了
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

class MazeForm : Form {
  const int W = 21, H = 13; // マスの数 (奇数)
  bool[,] wall = new bool[W, H];
  Point me, goal;
  int steps;
  List<Point> aiPath;
  bool showAi, cleared;
  Random rnd = new Random();

  MazeForm() {
    Text = "迷路探索AI";
    FormBorderStyle = FormBorderStyle.None;
    // 画面いっぱいの窓にする (最大化だと、ランチャーが手前に出すときに元のサイズへ戻されることがある)
    StartPosition = FormStartPosition.Manual;
    Bounds = Screen.PrimaryScreen.Bounds;
    BackColor = Color.White;
    DoubleBuffered = true;
    KeyPreview = true;
    NewMaze();
  }

  void NewMaze() {
    for (int x = 0; x < W; x++) for (int y = 0; y < H; y++) wall[x, y] = true;
    Dig(1, 1);
    me = new Point(1, 1); goal = new Point(W - 2, H - 2);
    steps = 0; showAi = false; cleared = false;
    aiPath = Bfs();
    Invalidate();
  }

  void Dig(int x, int y) {
    wall[x, y] = false;
    var dirs = new List<Point> { new Point(2, 0), new Point(-2, 0), new Point(0, 2), new Point(0, -2) };
    for (int i = dirs.Count - 1; i > 0; i--) { int j = rnd.Next(i + 1); var t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t; }
    foreach (var d in dirs) {
      int nx = x + d.X, ny = y + d.Y;
      if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && wall[nx, ny]) {
        wall[x + d.X / 2, y + d.Y / 2] = false;
        Dig(nx, ny);
      }
    }
  }

  // 幅優先探索: スタートから近いマスの順に調べ、ゴールから来た道を逆にたどる
  List<Point> Bfs() {
    var prev = new Dictionary<Point, Point>();
    var q = new Queue<Point>();
    q.Enqueue(new Point(1, 1)); prev[new Point(1, 1)] = new Point(-1, -1);
    while (q.Count > 0) {
      var p = q.Dequeue();
      if (p == goal) break;
      foreach (var d in new[] { new Point(1, 0), new Point(-1, 0), new Point(0, 1), new Point(0, -1) }) {
        var n = new Point(p.X + d.X, p.Y + d.Y);
        if (!wall[n.X, n.Y] && !prev.ContainsKey(n)) { prev[n] = p; q.Enqueue(n); }
      }
    }
    var path = new List<Point>();
    for (var p = goal; p.X >= 0; p = prev[p]) path.Add(p);
    path.Reverse();
    return path;
  }

  protected override void OnKeyDown(KeyEventArgs e) {
    if (e.KeyCode == Keys.Escape) { Close(); return; }
    if (e.KeyCode == Keys.N) { NewMaze(); return; }
    if (e.KeyCode == Keys.H) { showAi = !showAi; Invalidate(); return; }
    if (cleared) return;
    int dx = e.KeyCode == Keys.Right ? 1 : e.KeyCode == Keys.Left ? -1 : 0;
    int dy = e.KeyCode == Keys.Down ? 1 : e.KeyCode == Keys.Up ? -1 : 0;
    if (dx == 0 && dy == 0) return;
    if (!wall[me.X + dx, me.Y + dy]) { me = new Point(me.X + dx, me.Y + dy); steps++; }
    if (me == goal) { cleared = true; showAi = true; }
    Invalidate();
  }

  protected override bool IsInputKey(Keys k) { return true; }

  protected override void OnPaint(PaintEventArgs e) {
    var g = e.Graphics;
    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
    float sc = g.DpiY / 96f; // 画面の拡大率
    int top = (int)(150 * sc);
    int cell = Math.Min(ClientSize.Width / (W + 2), (ClientSize.Height - top - 40) / H);
    int ox = (ClientSize.Width - cell * W) / 2;
    using (var f = new Font("Yu Gothic UI", 26, FontStyle.Bold))
      g.DrawString("迷路探索AI", f, Brushes.Black, ox, 20 * sc);
    using (var f = new Font("Yu Gothic UI", 15)) {
      string msg = cleared
        ? string.Format("ゴール! あなた {0} 歩 / AI の最短 {1} 歩   N: 新しい迷路   Esc: 終わる", steps, aiPath.Count - 1)
        : string.Format("矢印キーで進む   H: AI の答え   N: 新しい迷路   Esc: 終わる      いま {0} 歩", steps);
      g.DrawString(msg, f, Brushes.DimGray, ox, 92 * sc);
    }
    for (int x = 0; x < W; x++) for (int y = 0; y < H; y++)
      if (wall[x, y]) g.FillRectangle(Brushes.Black, ox + x * cell, top + y * cell, cell, cell);
    if (showAi) using (var pen = new Pen(Color.FromArgb(160, 47, 107, 79), cell * 0.3f)) {
      var pts = aiPath.ConvertAll(p => new PointF(ox + p.X * cell + cell / 2f, top + p.Y * cell + cell / 2f)).ToArray();
      pen.LineJoin = System.Drawing.Drawing2D.LineJoin.Round;
      g.DrawLines(pen, pts);
    }
    g.FillRectangle(Brushes.Gold, ox + goal.X * cell + 4, top + goal.Y * cell + 4, cell - 8, cell - 8);
    g.FillEllipse(new SolidBrush(Color.FromArgb(192, 57, 43)), ox + me.X * cell + 5, top + me.Y * cell + 5, cell - 10, cell - 10);
  }

  // 高解像度の画面でもぼやけずに表示する
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  [STAThread] static void Main() { SetProcessDPIAware(); Application.EnableVisualStyles(); Application.Run(new MazeForm()); }
}
