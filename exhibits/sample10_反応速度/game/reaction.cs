// 反応速度チャレンジ: 赤 → 緑 になった瞬間にクリック (またはスペース)。5 回の平均でランク判定。Esc で終了
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

class ReactForm : Form {
  enum State { Ready, Wait, Go, Result, Early, Done }
  State st = State.Ready;
  Timer timer = new Timer();
  Stopwatch sw = new Stopwatch();
  List<long> times = new List<long>();
  Random rnd = new Random();

  ReactForm() {
    Text = "反応速度チャレンジ";
    FormBorderStyle = FormBorderStyle.None;
    // 画面いっぱいの窓にする (最大化だと、ランチャーが手前に出すときに元のサイズへ戻されることがある)
    StartPosition = FormStartPosition.Manual;
    Bounds = Screen.PrimaryScreen.Bounds;
    DoubleBuffered = true;
    KeyPreview = true;
    timer.Tick += (s, e) => { timer.Stop(); st = State.Go; sw.Restart(); Invalidate(); };
  }

  void Hit() {
    switch (st) {
      case State.Ready: case State.Result: case State.Early:
        st = State.Wait; timer.Interval = rnd.Next(1500, 4000); timer.Start(); break;
      case State.Wait:
        timer.Stop(); st = State.Early; break;
      case State.Go:
        sw.Stop(); times.Add(sw.ElapsedMilliseconds);
        st = times.Count >= 5 ? State.Done : State.Result; break;
      case State.Done:
        times.Clear(); st = State.Ready; break;
    }
    Invalidate();
  }

  protected override void OnMouseDown(MouseEventArgs e) { Hit(); }
  protected override void OnKeyDown(KeyEventArgs e) {
    if (e.KeyCode == Keys.Escape) Close();
    else if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter) Hit();
  }

  static string Rank(double ms) {
    return ms < 200 ? "S  プロゲーマー級!" : ms < 250 ? "A  すばらしい!" : ms < 300 ? "B  なかなか!" : ms < 400 ? "C  ふつう" : "D  もう一度挑戦!";
  }

  protected override void OnPaint(PaintEventArgs e) {
    var g = e.Graphics;
    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAlias;
    Color bg; string big, small;
    switch (st) {
      case State.Wait: bg = Color.FromArgb(192, 57, 43); big = "まだ…"; small = "緑になったらクリック!"; break;
      case State.Go: bg = Color.FromArgb(39, 174, 96); big = "いま!"; small = ""; break;
      case State.Result: bg = Color.FromArgb(31, 78, 140); big = times.Last() + " ミリ秒"; small = string.Format("{0} / 5 回   クリックで次へ", times.Count); break;
      case State.Early: bg = Color.FromArgb(176, 122, 18); big = "フライング!"; small = "クリックでやり直し"; break;
      case State.Done:
        bg = Color.FromArgb(17, 17, 17);
        double avg = times.Average();
        big = string.Format("平均 {0:0} ミリ秒", avg);
        small = "ランク " + Rank(avg) + "\n\nクリックでもう一度   Esc で終わる"; break;
      default: bg = Color.FromArgb(17, 17, 17); big = "反応速度チャレンジ"; small = "画面が赤から緑に変わったら、すぐにクリック (またはスペースキー)\n\nクリックでスタート   Esc で終わる"; break;
    }
    g.Clear(bg);
    var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
    var r = ClientRectangle;
    using (var f = new Font("Yu Gothic UI", 72, FontStyle.Bold))
      g.DrawString(big, f, Brushes.White, new RectangleF(0, 0, r.Width, r.Height * 0.55f), fmt);
    using (var f = new Font("Yu Gothic UI", 24))
      g.DrawString(small, f, Brushes.White, new RectangleF(0, r.Height * 0.5f, r.Width, r.Height * 0.35f), fmt);
  }

  // 高解像度の画面でもぼやけずに表示する
  [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  [STAThread] static void Main() { SetProcessDPIAware(); Application.EnableVisualStyles(); Application.Run(new ReactForm()); }
}
